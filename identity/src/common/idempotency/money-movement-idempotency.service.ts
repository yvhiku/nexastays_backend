import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { appConfig } from '../config/app.config';
import { canonicalRequestHash } from './canonical-request-hash';
import { MoneyMovementIdempotencyRecord } from './money-movement-idempotency-record.entity';
import { MoneyMovementIdempotencyStatus } from './money-movement-idempotency-status';
import { MoneyMovementScope } from './money-movement-scope';

export interface MoneyIdempotencyRunParams {
  scope: MoneyMovementScope;
  actorUserId: string;
  idempotencyKey: string;
  /** Body + route params (excludes raw header); `idempotency_key` field is ignored when hashing. */
  requestPayload: unknown;
  /** Initial reservation TTL (subsequent COMPLETED rows extend retention). */
  ttlHours?: number;
  /** After this, an IN_FLIGHT row may be reclaimed by a retry (crashed worker). */
  staleInFlightMinutes?: number;
}

/** Suggested client retry schedule when receiving 409 IN_FLIGHT (milliseconds). */
export const IDEMPOTENCY_IN_PROGRESS_RETRY_BACKOFF_MS = [750, 1500, 3000, 6000];

@Injectable()
export class MoneyMovementIdempotencyService {
  private readonly logger = new Logger(MoneyMovementIdempotencyService.name);

  /**
   * One transactional unit: advisory lock (serializes competing keys), row-level replay,
   * optional stale IN_FLIGHT recovery, then business work. Commits idempotency outcome with
   * the same atomic boundary as ledger-minded callers that pass `manager` through.
   */
  async runInTransaction<T>(
    dataSource: DataSource,
    params: MoneyIdempotencyRunParams,
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    const requestHash = canonicalRequestHash(params.requestPayload);
    const ttlHours = params.ttlHours ?? 24;
    const staleMinutes =
      params.staleInFlightMinutes ??
      appConfig.moneyIdempotencyStaleInFlightMinutes;
    const { scope, actorUserId, idempotencyKey } = params;

    return dataSource.transaction(async (manager) => {
      await this.acquireTransactionalAdvisoryLock(
        manager,
        scope,
        actorUserId,
        idempotencyKey,
      );

      const repo = manager.getRepository(MoneyMovementIdempotencyRecord);
      const existing = await repo.findOne({
        where: {
          scope,
          actor_user_id: actorUserId,
          idempotency_key: idempotencyKey,
        },
        lock: { mode: 'pessimistic_write' },
      });

      if (existing) {
        if (existing.request_hash !== requestHash) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_REUSE_DIFFERENT_REQUEST',
            message:
              'Idempotency-Key was already used with a different request payload for this actor and scope.',
          });
        }

        if (existing.status === MoneyMovementIdempotencyStatus.COMPLETED) {
          if (existing.response_json == null) {
            throw new ConflictException({
              code: 'IDEMPOTENCY_CORRUPT_ROW',
              message: 'Idempotency replay row is missing cached response.',
            });
          }
          return existing.response_json as T;
        }

        if (existing.status === MoneyMovementIdempotencyStatus.FAILED) {
          if (existing.error_json == null) {
            throw new ConflictException({
              code: 'IDEMPOTENCY_CORRUPT_ROW',
              message: 'Idempotency replay row is missing cached error.',
            });
          }
          throw this.toHttpException(existing);
        }

        if (existing.status === MoneyMovementIdempotencyStatus.UNCERTAIN) {
          throw new HttpException(
            {
              code: 'IDEMPOTENCY_OUTCOME_UNCERTAIN',
              message:
                'Prior attempt has no confirmed outcome (server/PSP ambiguity). Do not repeat money movement with the same Idempotency-Key until reconciliation.',
              idempotency_record_id: existing.id,
            },
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        }

        if (existing.status === MoneyMovementIdempotencyStatus.IN_FLIGHT) {
          if (!this.isStaleInFlight(existing, staleMinutes)) {
            throw new ConflictException({
              code: 'IDEMPOTENCY_IN_PROGRESS',
              message:
                'A request with this Idempotency-Key is still being processed. Retry with backoff.',
              retry_after_ms: IDEMPOTENCY_IN_PROGRESS_RETRY_BACKOFF_MS[0],
            });
          }
          this.logger.warn(
            `Reclaiming stale IN_FLIGHT idempotency row ${existing.id} (scope=${scope})`,
          );
          await repo.delete(existing.id);
        }
      }

      const row = repo.create({
        scope,
        actor_user_id: actorUserId,
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
        status: MoneyMovementIdempotencyStatus.IN_FLIGHT,
        expires_at: new Date(Date.now() + ttlHours * 3600 * 1000),
      });
      await repo.save(row);

      try {
        const result = await work(manager);
        const meta = this.extractLedgerMeta(result);
        await repo.update(row.id, {
          status: MoneyMovementIdempotencyStatus.COMPLETED,
          http_status: 200,
          response_json: result as object,
          response_contract_version:
            appConfig.moneyIdempotencyResponseContractVersion,
          ledger_transaction_id: meta.ledgerTransactionId,
          app_transaction_id: meta.appTransactionId,
          expires_at: new Date(Date.now() + 365 * 24 * 3600 * 1000),
        });
        return result;
      } catch (err) {
        const allowDelete = appConfig.idempotencyDeleteRowOnServerError;
        if (err instanceof HttpException) {
          const status = err.getStatus();
          if (status >= 400 && status < 500) {
            await repo.update(row.id, {
              status: MoneyMovementIdempotencyStatus.FAILED,
              http_status: status,
              error_json: this.serializeHttpException(err) as object,
            });
          } else if (allowDelete) {
            await repo.delete(row.id);
          } else {
            await repo.update(row.id, {
              status: MoneyMovementIdempotencyStatus.UNCERTAIN,
              http_status: status,
              error_json: this.serializeHttpException(err) as object,
            });
          }
        } else if (allowDelete) {
          await repo.delete(row.id);
        } else {
          await repo.update(row.id, {
            status: MoneyMovementIdempotencyStatus.UNCERTAIN,
            http_status: 500,
            error_json: this.serializeUnknownError(err) as object,
          });
        }
        throw err;
      }
    });
  }

  private extractLedgerMeta(result: unknown): {
    ledgerTransactionId: string | null;
    appTransactionId: string | null;
  } {
    if (!result || typeof result !== 'object') {
      return { ledgerTransactionId: null, appTransactionId: null };
    }
    const r = result as Record<string, unknown>;
    const appId =
      typeof r.transaction_id === 'string'
        ? r.transaction_id
        : typeof r.id === 'string'
          ? r.id
          : null;
    const ledgerId =
      typeof r.ledger_transaction_id === 'string'
        ? r.ledger_transaction_id
        : null;
    return {
      ledgerTransactionId: ledgerId,
      appTransactionId: appId,
    };
  }

  private isStaleInFlight(
    row: MoneyMovementIdempotencyRecord,
    staleMinutes: number,
  ): boolean {
    const threshold = Date.now() - staleMinutes * 60 * 1000;
    return row.updated_at.getTime() < threshold;
  }

  private serializeUnknownError(err: unknown): Record<string, unknown> {
    return {
      statusCode: 500,
      error: {
        code: 'INTERNAL_OR_UNKNOWN',
        message: err instanceof Error ? err.message : 'Unknown error',
      },
    };
  }

  private serializeHttpException(e: HttpException): Record<string, unknown> {
    const status = e.getStatus();
    const body = e.getResponse();
    return {
      statusCode: status,
      error: typeof body === 'object' && body !== null ? body : { message: body },
    };
  }

  private toHttpException(row: MoneyMovementIdempotencyRecord): HttpException {
    const err = row.error_json as {
      statusCode?: number;
      error?: unknown;
    } | null;
    const status = err?.statusCode ?? row.http_status ?? 409;
    const response = err?.error ?? { message: 'Request failed' };
    return new HttpException(response, status);
  }

  private async acquireTransactionalAdvisoryLock(
    manager: EntityManager,
    scope: MoneyMovementScope,
    actorUserId: string,
    idempotencyKey: string,
  ): Promise<void> {
    const material = `${scope}|${actorUserId}|${idempotencyKey}`;
    const buf = crypto.createHash('sha256').update(material, 'utf8').digest();
    const k1 = buf.readInt32BE(0);
    const k2 = buf.readInt32BE(4);
    await manager.query(
      'SELECT pg_advisory_xact_lock($1::int, $2::int)',
      [k1, k2],
    );
  }
}
