/**
 * Configuration object for making HTTP requests. Agnostic of any specific
 * HTTP library so a single contract works for axios, ofetch, native fetch,
 * or anything custom.
 */
export interface FetcherConfig {
    /** HTTP method (GET, POST, PUT, DELETE, PATCH, …). */
    method: string;
    /** URL endpoint (relative or absolute). */
    url: string;
    /** Query parameters; serialized to the query string by the fetcher. */
    params?: Record<string, unknown>;
    /** Request body. Pass a `FormData`/`Blob`/`ArrayBuffer` for binary payloads. */
    data?: unknown;
    /** HTTP headers. */
    headers?: Record<string, string>;
}

/**
 * A fetcher takes a {@link FetcherConfig} and returns a `Promise<unknown>`.
 * Consumers narrow the return type at the call site (e.g. `RestStd.getOne<User>(...)`).
 */
export type Fetcher = (config: FetcherConfig) => Promise<unknown>;
