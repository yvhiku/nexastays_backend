/**
 * Simple structured logger. Do NOT log sensitive data (OTP, tokens, ID numbers, PIN).
 */
const SENSITIVE_KEYS = [
  'otp',
  'pin',
  'password',
  'token',
  'authorization',
  'national_id_number',
  'session_token',
];

function redact(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redact);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const lower = k.toLowerCase();
    if (SENSITIVE_KEYS.some((s) => lower.includes(s))) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = redact(v);
    }
  }
  return out;
}

export const logger = {
  log(message: string, context?: string, meta?: Record<string, unknown>) {
    const payload = {
      timestamp: new Date().toISOString(),
      level: 'log',
      message,
      ...(context && { context }),
      ...(meta && { meta: redact(meta) }),
    };
    console.log(JSON.stringify(payload));
  },
  error(message: string, context?: string, meta?: Record<string, unknown>) {
    const payload = {
      timestamp: new Date().toISOString(),
      level: 'error',
      message,
      ...(context && { context }),
      ...(meta && { meta: redact(meta) }),
    };
    console.error(JSON.stringify(payload));
  },
  warn(message: string, context?: string, meta?: Record<string, unknown>) {
    const payload = {
      timestamp: new Date().toISOString(),
      level: 'warn',
      message,
      ...(context && { context }),
      ...(meta && { meta: redact(meta) }),
    };
    console.warn(JSON.stringify(payload));
  },
};
