import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { MONEY_IDEMPOTENCY_SCOPE_KEY } from '../idempotency/money-idempotency-metadata';

const KEY_PATTERN = /^[a-zA-Z0-9._-]{8,128}$/;

/**
 * Requires `Idempotency-Key` (or `X-Idempotency-Key`) for routes decorated with
 * {@link RequireMoneyIdempotencyHeader}. Stores the normalized key on the request
 * as `moneyIdempotencyKey` for controllers/services.
 */
@Injectable()
export class MoneyIdempotencyKeyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const scope = this.reflector.get<string | undefined>(
      MONEY_IDEMPOTENCY_SCOPE_KEY,
      context.getHandler(),
    );
    if (!scope) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const raw =
      req.headers['idempotency-key'] ?? req.headers['x-idempotency-key'];
    const key = (Array.isArray(raw) ? raw[0] : raw)?.trim();

    if (!key) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message:
          'Idempotency-Key header is required for this money movement operation.',
      });
    }
    if (!KEY_PATTERN.test(key)) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_INVALID',
        message:
          'Idempotency-Key must be 8–128 characters [a-zA-Z0-9._-].',
      });
    }

    (req as Request & { moneyIdempotencyKey?: string }).moneyIdempotencyKey =
      key;
    return true;
  }
}
