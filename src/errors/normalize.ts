import { BaseError } from './BaseError';
import { NetworkError } from './NetworkError';
import { ServerError } from './ServerError';

/**
 * Extracts an HTTP status code from heterogeneous error shapes
 * (axios: `error.response.status`; ofetch/fetch: `error.status` / `error.statusCode`).
 */
function getStatus(error: Record<string, any>): number | undefined {
  return error?.response?.status ?? error?.statusCode ?? error?.status;
}

/**
 * Normalizes any thrown value into the library's error hierarchy so that
 * consumers get a consistent error contract regardless of the underlying
 * fetcher (axios, ofetch, native fetch).
 *
 * - Already a {@link BaseError} → returned untouched (idempotent).
 * - HTTP error with status >= 500 → {@link ServerError}.
 * - Any other HTTP error → {@link NetworkError}.
 * - Native `fetch` TypeError → {@link NetworkError} via `fromFetchError`.
 * - Anything else → returned unchanged so callers can rethrow it as-is.
 */
export function normalizeHttpError(error: unknown): unknown {
  if (error instanceof BaseError) {
    return error;
  }

  if (error && typeof error === 'object') {
    const e = error as Record<string, any>;
    const isHttp =
      'response' in e ||
      e.isAxiosError === true ||
      typeof e.status === 'number' ||
      typeof e.statusCode === 'number';

    if (isHttp) {
      const status = getStatus(e);
      const responseData = e.response?.data ?? e.data;
      const message =
        responseData?.message || e.message || 'Network request failed';
      const context = {
        url: e.config?.url ?? e.request?.url,
        method: e.config?.method,
        responseData,
      };

      if (typeof status === 'number' && status >= 500) {
        return new ServerError(message, status, context);
      }
      return new NetworkError(message, status, e, context);
    }

    if (
      e instanceof Error &&
      e.name === 'TypeError' &&
      typeof e.message === 'string' &&
      e.message.includes('fetch')
    ) {
      return NetworkError.fromFetchError(e);
    }
  }

  return error;
}
