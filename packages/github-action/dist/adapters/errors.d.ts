/** Read an HTTP status from an unknown thrown value without trusting it. */
export declare function errorStatus(error: unknown): number | undefined;
/** True when a GitHub failure means "not permitted" rather than "broken". */
export declare function isPermissionError(error: unknown): boolean;
/** True when the requested resource simply does not exist. */
export declare function isNotFoundError(error: unknown): boolean;
/** A short, non-sensitive description of a failure for structured warnings. */
export declare function describeError(error: unknown): string;
//# sourceMappingURL=errors.d.ts.map