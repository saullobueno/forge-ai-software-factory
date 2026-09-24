const REDACTED = '[REDACTED]';
const CIRCULAR = '[Circular]';

export function redactSensitiveValues(value: unknown): unknown {
  return redactValue(value, new WeakSet<object>());
}

function redactValue(value: unknown, seen: WeakSet<object>): unknown {
  if (!value || typeof value !== 'object') return value;

  if (seen.has(value)) return CIRCULAR;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, seen));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      isSensitiveKey(key) ? REDACTED : redactValue(item, seen),
    ]),
  );
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/[-_]/g, '').toLowerCase();
  return (
    normalized === 'password' ||
    normalized === 'passwordhash' ||
    normalized === 'secret' ||
    normalized.endsWith('secret') ||
    normalized === 'token' ||
    (normalized.endsWith('token') && !normalized.endsWith('tokens')) ||
    normalized === 'authorization' ||
    normalized === 'cookie' ||
    normalized === 'apikey' ||
    normalized === 'privatekey'
  );
}
