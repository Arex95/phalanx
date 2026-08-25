import { objectToFormData } from "@/utils/objects";
import { ContentTypeEnum } from "@/enums";
import { Fetcher, FetcherConfig } from "@/types/Fetcher";
import {
    GetAllOptions,
    GetOneOptions,
    CreateOptions,
    UpdateOptions,
    PatchOptions,
    DeleteOptions,
    BulkCreateOptions,
    BulkUpdateOptions,
    BulkDeleteOptions,
    UpsertOptions,
    CustomRequestOptions,
} from "@/types/RestStdOptions";
import { createAxiosFetcher } from "@/fetchers/axios";
import { getConfiguredAxiosInstance } from "@/config/axios/axiosInstance";
import { retryWithBackoff, RetryConfig } from "@/utils/retry";
import { normalizeHttpError } from "@/errors";

/**
 * Base class for REST resources. Extend it and override `resource` to get a
 * full CRUD interface backed by the configured Axios instance (or a custom
 * fetcher set via `fetchFn`).
 *
 * Request bodies are serialized based on their runtime shape:
 *   - `FormData` / `Blob` / `ArrayBuffer` → sent as-is, no `Content-Type`
 *     header is set so the underlying client emits the correct multipart
 *     `boundary`. Convert plain objects with the exported `objectToFormData()`
 *     helper when you need multipart.
 *   - Everything else → sent as JSON.
 *
 * @example
 * ```typescript
 * export class Role extends RestStd {
 *     static override resource = 'roles';
 * }
 *
 * const roles = await Role.getAll<RoleResponse[]>();
 * await Role.create<RoleResponse, RolePayload>({ data: payload });
 * ```
 */
export class RestStd {
    /**
     * The resource endpoint. MUST be overridden in subclasses.
     * @example static override resource = 'users';
     */
    static resource: string;

    /** Headers attached to every request issued by this class. */
    static headers: Record<string, string> = {};

    /** Custom fetcher. Defaults to the configured Axios instance. */
    static fetchFn?: Fetcher;

    /** Retry configuration for failed requests. */
    static retryConfig?: RetryConfig;

    protected static validateResource(): void {
        if (!this.resource || this.resource.trim() === '') {
            throw new Error(
                `[${this.name}] Static property 'resource' is required. ` +
                `Define it with: static override resource = 'your-resource';`
            );
        }
    }

    private static getFetchFn(): Fetcher {
        if (this.fetchFn) return this.fetchFn;
        return createAxiosFetcher(getConfiguredAxiosInstance());
    }

    /**
     * Executes a request with optional retry/backoff. Errors are normalized
     * to the typed hierarchy (AuthError / ValidationError / ServerError /
     * NetworkError) regardless of the underlying fetcher.
     */
    private static async executeFetch<T>(config: FetcherConfig): Promise<T> {
        const fetcher = this.getFetchFn();

        const run = async (): Promise<T> => {
            try {
                return (await fetcher(config)) as T;
            } catch (error: unknown) {
                throw normalizeHttpError(error);
            }
        };

        if (this.retryConfig) {
            return retryWithBackoff(run, this.retryConfig);
        }
        return run();
    }

    private static buildUrl(baseUrl: string, suffix?: string): string {
        const cleanBase = baseUrl.replace(/\/$/, '');
        if (!suffix) return cleanBase;
        const cleanSuffix = suffix.startsWith('/') ? suffix : `/${suffix}`;
        return cleanBase + cleanSuffix;
    }

    /**
     * Body + headers for a write request. Centralised so every method emits
     * exactly the same Content-Type policy:
     *   - Binary payloads (`FormData`/`Blob`/`ArrayBuffer`) → no Content-Type
     *     (let axios/fetch add the right multipart boundary).
     *   - Otherwise → `application/json`.
     */
    private static prepareWrite(data: unknown): { body: unknown; headers: Record<string, string> } {
        const isBinary =
            (typeof FormData !== 'undefined' && data instanceof FormData) ||
            (typeof Blob !== 'undefined' && data instanceof Blob) ||
            (typeof ArrayBuffer !== 'undefined' && data instanceof ArrayBuffer);

        const headers: Record<string, string> = { ...this.headers };
        if (!isBinary && data !== undefined && data !== null) {
            headers['Content-Type'] = ContentTypeEnum.JSON;
        }
        return { body: data, headers };
    }

    /** Merges class-level headers into a read request (GET/DELETE). */
    private static readHeaders(): Record<string, string> {
        return { ...this.headers };
    }

    /** Sets/overrides class-level headers. */
    static setHeaders(headers: Record<string, string>): void {
        this.headers = { ...this.headers, ...headers };
    }

    // ── Read ────────────────────────────────────────────────────────────

    static getAll<
        TResponse = unknown,
        TParams extends Record<string, unknown> = Record<string, unknown>,
        TData = unknown
    >(options: GetAllOptions<TParams, TData> = {}): Promise<TResponse> {
        this.validateResource();
        const { params, data, url } = options;
        const finalUrl = url || this.resource;
        const hasData = data !== undefined && data !== null;

        return this.executeFetch<TResponse>({
            method: 'GET',
            url: finalUrl,
            params,
            data: hasData ? data : undefined,
            headers: hasData ? this.prepareWrite(data).headers : this.readHeaders(),
        });
    }

    static getOne<
        TResponse = unknown,
        TParams extends Record<string, unknown> = Record<string, unknown>
    >(options: GetOneOptions<TParams>): Promise<TResponse> {
        this.validateResource();
        const { id, params, url } = options;
        return this.executeFetch<TResponse>({
            method: 'GET',
            url: this.buildUrl(url || this.resource, String(id)),
            params,
            headers: this.readHeaders(),
        });
    }

    // ── Write ───────────────────────────────────────────────────────────

    static create<TResponse = unknown, TData = unknown>(
        options: CreateOptions<TData>
    ): Promise<TResponse> {
        this.validateResource();
        const { data, url } = options;
        const { body, headers } = this.prepareWrite(data);
        return this.executeFetch<TResponse>({
            method: 'POST',
            url: url || this.resource,
            data: body,
            headers,
        });
    }

    static update<TResponse = unknown, TData = unknown>(
        options: UpdateOptions<TData>
    ): Promise<TResponse> {
        this.validateResource();
        const { id, data, url } = options;
        const { body, headers } = this.prepareWrite(data);
        return this.executeFetch<TResponse>({
            method: 'PUT',
            url: this.buildUrl(url || this.resource, String(id)),
            data: body,
            headers,
        });
    }

    static patch<TResponse = unknown, TData = unknown>(
        options: PatchOptions<TData>
    ): Promise<TResponse> {
        this.validateResource();
        const { id, data, url } = options;
        const { body, headers } = this.prepareWrite(data);
        return this.executeFetch<TResponse>({
            method: 'PATCH',
            url: this.buildUrl(url || this.resource, String(id)),
            data: body,
            headers,
        });
    }

    static delete<TResponse = unknown>(options: DeleteOptions): Promise<TResponse> {
        this.validateResource();
        const { id, url } = options;
        return this.executeFetch<TResponse>({
            method: 'DELETE',
            url: this.buildUrl(url || this.resource, String(id)),
            headers: this.readHeaders(),
        });
    }

    // ── Bulk ────────────────────────────────────────────────────────────

    static bulkCreate<TResponse = unknown, TData = unknown>(
        options: BulkCreateOptions<TData>
    ): Promise<TResponse> {
        this.validateResource();
        const { data, url } = options;
        const { body, headers } = this.prepareWrite(data);
        return this.executeFetch<TResponse>({
            method: 'POST',
            url: this.buildUrl(url || this.resource, 'bulk'),
            data: body,
            headers,
        });
    }

    static bulkUpdate<TResponse = unknown, TData = unknown>(
        options: BulkUpdateOptions<TData>
    ): Promise<TResponse> {
        this.validateResource();
        const { data, url } = options;
        const { body, headers } = this.prepareWrite(data);
        return this.executeFetch<TResponse>({
            method: 'PUT',
            url: this.buildUrl(url || this.resource, 'bulk'),
            data: body,
            headers,
        });
    }

    static bulkDelete<TResponse = unknown>(options: BulkDeleteOptions): Promise<TResponse> {
        this.validateResource();
        const { ids, url } = options;
        const { body, headers } = this.prepareWrite({ ids });
        return this.executeFetch<TResponse>({
            method: 'DELETE',
            url: this.buildUrl(url || this.resource, 'bulk'),
            data: body,
            headers,
        });
    }

    // ── Upsert ──────────────────────────────────────────────────────────

    /**
     * Updates when `data.id` is defined (including `0` and `''`), creates
     * otherwise. The id-as-0 case is intentional: many backends use it for
     * sentinel rows.
     */
    static upsert<TResponse = unknown, TData = unknown>(
        options: UpsertOptions<TData>
    ): Promise<TResponse> {
        if (options.data.id !== undefined && options.data.id !== null) {
            return this.update<TResponse, TData>({
                id: options.data.id,
                data: options.data,
                url: options.url,
            });
        }
        return this.create<TResponse, TData>({
            data: options.data,
            url: options.url,
        });
    }

    // ── Custom ──────────────────────────────────────────────────────────

    static customRequest<
        TResponse = unknown,
        TParams extends Record<string, unknown> = Record<string, unknown>,
        TData = unknown
    >(options: CustomRequestOptions<TParams, TData>): Promise<TResponse> {
        const { method, url, params, data } = options;
        const hasBody = data !== undefined && data !== null;
        const { body, headers } = hasBody
            ? this.prepareWrite(data)
            : { body: undefined, headers: this.readHeaders() };

        return this.executeFetch<TResponse>({
            method,
            url,
            params,
            data: body,
            headers,
        });
    }
}

export { objectToFormData };
