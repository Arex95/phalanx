import { BaseError } from './BaseError';
import { NetworkError } from './NetworkError';
import { AuthError } from './AuthError';
import { ValidationError, ValidationIssue } from './ValidationError';
import { ServerError } from './ServerError';

type HttpErrorInput = {
  message?: string;
  response?: { status?: number; data?: unknown; headers?: unknown };
  config?: { url?: string; method?: string };
  request?: { url?: string };
  isAxiosError?: boolean;
  status?: number;
  statusCode?: number;
  data?: unknown;
};

function getStatus(e: HttpErrorInput): number | undefined {
  return e?.response?.status ?? e?.statusCode ?? e?.status;
}

function isHttpErrorInput(e: object): e is HttpErrorInput {
  const r = e as HttpErrorInput;
  return (
    'response' in r ||
    r.isAxiosError === true ||
    typeof r.status === 'number' ||
    typeof r.statusCode === 'number'
  );
}

/**
 * Best-effort extraction of validation issues from common backend shapes.
 * Returns `[]` when the response shape is unrecognised — callers still have
 * access to the original payload via `error.context.responseData`.
 *
 * Supported shapes:
 *   - Spring Boot `BindingResult` → `{ errors: [{ field, defaultMessage, rejectedValue }] }`
 *   - NestJS `class-validator`     → `{ message: string[] }`
 *   - JSON:API                     → `{ errors: [{ source: { pointer }, detail, title }] }`
 *   - Laravel                      → `{ errors: { field: string[] } }`
 */
function extractIssues(data: unknown): ValidationIssue[] {
  if (!data || typeof data !== 'object') return [];
  const d = data as Record<string, unknown>;

  // Spring: array of `{ field, defaultMessage, rejectedValue }`
  if (Array.isArray(d.errors)) {
    const list = d.errors as Array<Record<string, unknown>>;
    if (list[0] && 'field' in list[0]) {
      return list.map((e) => ({
        field: String(e.field ?? ''),
        message: String(e.defaultMessage ?? e.message ?? ''),
        value: e.rejectedValue,
      }));
    }
    // JSON:API: errors with `source.pointer`
    const first = list[0];
    const source = first && (first as { source?: { pointer?: unknown } }).source;
    if (source && typeof source.pointer === 'string') {
      return list.map((e) => {
        const src = (e as { source?: { pointer?: string } }).source;
        const pointer = src?.pointer ?? '';
        return {
          field: pointer.split('/').pop() ?? '',
          message: String((e as { detail?: unknown; title?: unknown }).detail ?? (e as { title?: unknown }).title ?? ''),
        };
      });
    }
  }

  // NestJS class-validator: `message` is an array of strings
  if (Array.isArray(d.message)) {
    return (d.message as unknown[]).map((m) => ({ field: '', message: String(m) }));
  }

  // Laravel: `errors` is a record of `field -> string[]`
  if (d.errors && typeof d.errors === 'object' && !Array.isArray(d.errors)) {
    return Object.entries(d.errors as Record<string, unknown>).flatMap(([field, msgs]) => {
      const list = Array.isArray(msgs) ? msgs : [msgs];
      return list.map((m) => ({ field, message: String(m) }));
    });
  }

  return [];
}

/**
 * Normalizes any thrown value into the typed error hierarchy so consumers can
 * branch with `instanceof` regardless of the underlying fetcher.
 *
 * - 401 / 403            → {@link AuthError}
 * - 422                  → {@link ValidationError} with `issues` extracted heuristically
 * - 5xx                  → {@link ServerError}
 * - Any other HTTP shape → {@link NetworkError}
 * - Native fetch TypeError → {@link NetworkError} via `fromFetchError`
 * - Already a `BaseError` → returned untouched (idempotent)
 * - Anything else        → returned unchanged so callers can rethrow as-is
 */
export function normalizeHttpError(error: unknown): unknown {
  if (error instanceof BaseError) return error;

  if (error && typeof error === 'object') {
    if (isHttpErrorInput(error)) {
      const e = error as HttpErrorInput;
      const status = getStatus(e);
      const responseData = e.response?.data ?? e.data;
      const message =
        (responseData as { message?: string } | undefined)?.message ||
        e.message ||
        'Network request failed';
      const context: Record<string, unknown> = {
        url: e.config?.url ?? e.request?.url,
        method: e.config?.method,
        responseData,
        // Preserved so a consumer can still read a backend-specific signal
        // (e.g. a custom `x-error-code` header) after normalization — this
        // used to be silently dropped, forcing consumers back to the raw,
        // pre-normalization error just to read a header.
        headers: e.response?.headers,
      };

      if (status === 401 || status === 403) {
        return new AuthError(message, context);
      }
      if (status === 422) {
        return new ValidationError(message, extractIssues(responseData), context);
      }
      if (typeof status === 'number' && status >= 500) {
        return new ServerError(message, status, context);
      }
      return new NetworkError(message, status, e, context);
    }

    if (
      error instanceof Error &&
      error.name === 'TypeError' &&
      typeof error.message === 'string' &&
      error.message.includes('fetch')
    ) {
      return NetworkError.fromFetchError(error);
    }
  }

  return error;
}
