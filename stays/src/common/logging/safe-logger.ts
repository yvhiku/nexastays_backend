const SENSITIVE_KEY =
  /(token|authorization|password|pin|otp|phone|email|national_?id|secret|session)/i;

function redactString(input: string): string {
  return input
    .replace(
      /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/g,
      '[REDACTED]',
    )
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, '[REDACTED]')
    .replace(/\+?\d{8,15}/g, '[REDACTED]');
}

function sanitize(value: unknown, key?: string): unknown {
  if (value == null) return value;
  if (key && SENSITIVE_KEY.test(key)) return '[REDACTED]';
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([k, v]) => [k, sanitize(v, k)],
    );
    return Object.fromEntries(entries);
  }
  return value;
}

const isProduction = process.env.NODE_ENV === 'production';

export const safeLogger = {
  debug(message: string, data?: unknown): void {
    if (isProduction) return;
    if (data === undefined) {
      console.log(message);
      return;
    }

    console.log(message, sanitize(data));
  },
  info(message: string, data?: unknown): void {
    if (data === undefined) {
      console.log(message);
      return;
    }

    console.log(message, sanitize(data));
  },
  error(message: string, error?: unknown, data?: unknown): void {
    const payload = {
      error: sanitize(error),
      data: sanitize(data),
    };

    console.error(message, payload);
  },
};
