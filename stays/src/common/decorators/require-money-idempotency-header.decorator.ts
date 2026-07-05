import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { MoneyIdempotencyKeyGuard } from '../guards/money-idempotency-key.guard';
import { MONEY_IDEMPOTENCY_SCOPE_KEY } from '../idempotency/money-idempotency-metadata';
import { MoneyMovementScope } from '../idempotency/money-movement-scope';

/**
 * Enforces a client-provided idempotency key (header) and tags the route scope for audits.
 */
export function RequireMoneyIdempotencyHeader(scope: MoneyMovementScope) {
  return applyDecorators(
    SetMetadata(MONEY_IDEMPOTENCY_SCOPE_KEY, scope),
    UseGuards(MoneyIdempotencyKeyGuard),
  );
}
