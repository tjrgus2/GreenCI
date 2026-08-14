import { z } from 'zod';

const HttpErrorSchema = z
  .object({ status: z.number().int().optional() })
  .passthrough();

/** Read an HTTP status from an unknown thrown value without trusting it. */
export function errorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  const parsed = HttpErrorSchema.safeParse(error);
  return parsed.success ? parsed.data.status : undefined;
}

/** True when a GitHub failure means "not permitted" rather than "broken". */
export function isPermissionError(error: unknown): boolean {
  const status = errorStatus(error);
  return status === 401 || status === 403;
}

/** True when the requested resource simply does not exist. */
export function isNotFoundError(error: unknown): boolean {
  return errorStatus(error) === 404;
}

/** A short, non-sensitive description of a failure for structured warnings. */
export function describeError(error: unknown): string {
  const status = errorStatus(error);
  if (status !== undefined) {
    return `HTTP ${status}`;
  }
  return error instanceof Error ? error.name : 'unknown error';
}
