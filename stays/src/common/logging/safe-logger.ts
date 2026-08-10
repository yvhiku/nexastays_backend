/**
 * Structured JSON logger with redaction (PROD-OPS-003).
 */
import {
  resolveObsStage,
  sanitizeForTelemetry,
  getRequestContext,
} from '@nexa/telemetry';

const SERVICE = process.env.NEXA_SERVICE_NAME || 'nexa-stays';

function emit(
  level: 'debug' | 'info' | 'warn' | 'error',
  event: string,
  data?: unknown,
  error?: unknown,
): void {
  if (level === 'debug' && process.env.NODE_ENV === 'production') return;
  const ctx = getRequestContext();
  const line = JSON.stringify(
    sanitizeForTelemetry({
      ts: new Date().toISOString(),
      level,
      service: SERVICE,
      environment: resolveObsStage(),
      event,
      request_id: ctx.requestId,
      ...(error !== undefined ? { error } : {}),
      ...(data !== undefined ? { data } : {}),
    }),
  );
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const safeLogger = {
  debug(message: string, data?: unknown): void {
    emit('debug', message, data);
  },
  info(message: string, data?: unknown): void {
    emit('info', message, data);
  },
  warn(message: string, data?: unknown): void {
    emit('warn', message, data);
  },
  error(message: string, error?: unknown, data?: unknown): void {
    emit('error', message, data, error);
  },
};
