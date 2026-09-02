import { BaseError } from './BaseError';

/**
 * Default header an API uses to carry a machine-readable error code alongside
 * the human-readable message.
 */
export const ERROR_CODE_HEADER = 'x-error-code';

type HeaderBag = Record<string, unknown>;

function readHeader(headers: unknown, header: string): string | null {
    if (!headers || typeof headers !== 'object') return null;
    const bag = headers as HeaderBag;
    // Header names are case-insensitive; axios lowercases them, `fetch` does
    // not necessarily, and a hand-rolled fetcher may pass them through as sent.
    const key = Object.keys(bag).find((k) => k.toLowerCase() === header.toLowerCase());
    if (key === undefined) return null;
    const value = bag[key];
    if (typeof value === 'string') return value;
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
    return null;
}

/**
 * Reads the error code an API returned in a response header.
 *
 * Works on the normalized errors this library throws — where the headers live
 * in `context.headers` — and on a raw axios error, which is what a consumer
 * still holds when it calls a transport directly.
 */
export function getErrorCode(error: unknown, header: string = ERROR_CODE_HEADER): string | null {
    if (error instanceof BaseError) {
        return readHeader(error.context?.headers, header);
    }
    if (error && typeof error === 'object') {
        const response = (error as { response?: { headers?: unknown } }).response;
        if (response) return readHeader(response.headers, header);
    }
    return null;
}

/** `true` when the API returned exactly this code. */
export function isErrorCode(
    error: unknown,
    code: string,
    header: string = ERROR_CODE_HEADER
): boolean {
    return getErrorCode(error, header) === code;
}
