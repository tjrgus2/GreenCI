import { createHash } from 'node:crypto';

/**
 * Serialize a JSON-shaped value with deterministically ordered object keys so
 * that fingerprints and configuration hashes never depend on insertion order.
 * Values that JSON cannot represent are serialized as `null`.
 */
export function canonicalJson(value: unknown): string {
  if (value === undefined || value === null) {
    return 'null';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry: unknown) => canonicalJson(entry)).join(',')}]`;
  }
  if (typeof value !== 'object') {
    return 'null';
  }
  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
  return `{${entries.join(',')}}`;
}

/** Hash a UTF-8 string with SHA-256 and return lowercase hexadecimal. */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** Hash the canonical serialization of a JSON-shaped value. */
export function canonicalHash(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}
