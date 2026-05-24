import { objectToFormData } from "@/utils";
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
 * A standardized RESTful class that provides a generic interface for performing
 * CRUD (Create, Read, Update, Delete) operations on a specific API resource. It is designed
 * to be extended directly from your models. It supports both JSON and FormData requests.
 * 
 * @example
 * ```typescript
 * export class Role extends RestStd {
 *     static override resource = 'roles';
 *     static fetchFn = createAxiosFetcher(axiosInstance);
 * }
 * 
 * const roles = await Role.getAll();
 * ```
 */
export class RestStd {
    /** 
     * The resource endpoint. MUST be overridden in subclasses.
     * @example static override resource = 'users';
     */
    static resource: string;
    
    /** A flag to determine if request data should be sent as FormData. Defaults to `false`. */
    static isFormData: boolean = false;
    
    /** A record of global headers to be sent with every request. */
    static headers: Record<string, string> = {};
    
    /** The function used to make the actual HTTP requests. Optional, defaults to Axios fetcher. */
    static fetchFn?: Fetcher;
    
    /** Retry configuration for failed requests. Optional. */
    static retryConfig?: RetryConfig;

    /**
     * Validates that the resource property is defined.
     * @throws {Error} If resource is not defined
     */
    protected static validateResource(): void {
        if (!this.resource || this.resource.trim() === '') {
            throw new Error(
                `[${this.constructor.name}] Static property 'resource' is required. ` +
                `Please define: static override resource = 'your-resource';`
            );
        }
    }

    /**
     * Gets the fetcher function, using default if not provided.
     * Creates a default Axios fetcher if not configured, allowing lazy initialization.
     * @returns The fetcher function to use
     */
    private static getFetchFn(): Fetcher {
        if (this.fetchFn) {
            return this.fetchFn;
        }
        const axiosInstance = getConfiguredAxiosInstance();
        return createAxiosFetcher(axiosInstance);
    }

    /**
     * Executes a fetch request with optional retry logic.
     * @param config - The fetcher configuration
     * @returns A promise that resolves with the response data
     */
    private static async executeFetch<T>(config: FetcherConfig): Promise<T> {
        const fetcher = this.getFetchFn();

        // Single code path normalizes errors for BOTH the retry and non-retry
        // branches. Previously the retry branch bypassed error wrapping, so a
        // custom/ofetch fetcher returned raw errors and `retryCondition` never
        // matched (5xx were not retried, ServerError was never produced).
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

    /**
     * Builds a URL by combining base URL and suffix.
     * @param baseUrl - The base URL
     * @param suffix - Optional suffix to append
     * @returns The combined URL
     */
    private static buildUrl(baseUrl: string, suffix?: string): string {
        const cleanBase = baseUrl.replace(/\/$/, '');
        if (suffix) {
            const cleanSuffix = suffix.startsWith('/') ? suffix : `/${suffix}`;
            return cleanBase + cleanSuffix;
        }
        return cleanBase;
    }

    /**
     * Sets global headers that will be included in all subsequent requests made by this class.
     * @param headers - An object containing the headers to be set
     */
    static setHeaders(headers: Record<string, string>): void {
        this.headers = { ...this.headers, ...headers };
    }

    /**
     * Conditionally transforms the request data to FormData if `isFormData` is true.
     * @param data - The data to be potentially transformed
     * @returns The transformed data as FormData, or the original data
     */
    static transformData(data: unknown): FormData | unknown {
        if (this.isFormData) {
            return objectToFormData(data);
        }
        return data;
    }

    /**
     * Fetches a list of items from the resource's endpoint.
     * @template TResponse The expected response type
     * @template TParams The type of query parameters
     * @template TData The type of request body data
     * @param options - Options including params, data, and optional url override
     * @returns A promise that resolves with the response data
     */
    static getAll<TResponse = unknown, TParams extends Record<string, unknown> = Record<string, unknown>, TData = unknown>(
        options: GetAllOptions<TParams, TData> = {}
    ): Promise<TResponse> {
        this.validateResource();
        const { params, data, url } = options;
        const finalUrl = url || this.resource;
        
        const hasData = data !== undefined && data !== null;
        const headers: Record<string, string> = { ...this.headers };
        if (hasData) {
            headers["Content-Type"] = ContentTypeEnum.JSON;
        }

        // `params` and `data` are independent: query params are always sent, and
        // a body is added only when provided. Previously passing `data` silently
        // discarded `params`, which was a footgun.
        const config: FetcherConfig = {
            method: "GET",
            url: finalUrl,
            params,
            data: hasData ? data : undefined,
            headers,
        };
        
        return this.executeFetch<TResponse>(config);
    }

    /**
     * Fetches a single item by its ID.
     * @template TResponse The expected response type
     * @template TParams The type of query parameters
     * @param options - Options including id, params, options, and optional url override
     * @returns A promise that resolves with the response data
     */
    static getOne<TResponse = unknown, TParams extends Record<string, unknown> = Record<string, unknown>>(
        options: GetOneOptions<TParams>
    ): Promise<TResponse> {
        this.validateResource();
        const { id, params, url } = options;
        const baseUrl = url || this.resource;
        const finalUrl = this.buildUrl(baseUrl, String(id));
        
        const config: FetcherConfig = {
            method: "GET",
            url: finalUrl,
            params,
            headers: this.headers,
        };
        
        return this.executeFetch<TResponse>(config);
    }

    /**
     * Creates a new item.
     * @template TResponse The expected response type
     * @template TData The type of data to send
     * @param options - Options including data, options, and optional url override
     * @returns A promise that resolves with the response data
     */
    static create<TResponse = unknown, TData = unknown>(
        options: CreateOptions<TData>
    ): Promise<TResponse> {
        this.validateResource();
        const { data, url } = options;
        const finalUrl = url || this.resource;
        const transformedData = this.transformData(data);
        
        const config: FetcherConfig = {
            method: "POST",
            url: finalUrl,
            data: transformedData,
            headers: {
                ...this.headers,
                "Content-Type": this.isFormData
                    ? ContentTypeEnum.FORM_DATA
                    : ContentTypeEnum.JSON,
            },
        };
        
        return this.executeFetch<TResponse>(config);
    }

    /**
     * Creates multiple new items in a single request.
     * @template TResponse The expected response type
     * @template TData The type of data items to send
     * @param options - Options including data array, options, and optional url override
     * @returns A promise that resolves with the response data
     */
    static bulkCreate<TResponse = unknown, TData = unknown>(
        options: BulkCreateOptions<TData>
    ): Promise<TResponse> {
        this.validateResource();
        const { data, url } = options;
        const baseUrl = url || this.resource;
        const finalUrl = this.buildUrl(baseUrl, 'bulk');
        const transformedData = this.isFormData
            ? data.map((item: TData) => this.transformData(item))
            : data;
        
        const config: FetcherConfig = {
            method: "POST",
            url: finalUrl,
            data: transformedData,
            headers: {
                ...this.headers,
                "Content-Type": this.isFormData
                    ? ContentTypeEnum.FORM_DATA
                    : ContentTypeEnum.JSON,
            },
        };
        
        return this.executeFetch<TResponse>(config);
    }

    /**
     * Updates an existing item by its ID.
     * @template TResponse The expected response type
     * @template TData The type of data to send
     * @param options - Options including id, data, options, and optional url override
     * @returns A promise that resolves with the response data
     */
    static update<TResponse = unknown, TData = unknown>(
        options: UpdateOptions<TData>
    ): Promise<TResponse> {
        this.validateResource();
        const { id, data, url } = options;
        const baseUrl = url || this.resource;
        const finalUrl = this.buildUrl(baseUrl, String(id));
        const transformedData = this.transformData(data);
        
        const config: FetcherConfig = {
            method: "PUT",
            url: finalUrl,
            data: transformedData,
            headers: {
                ...this.headers,
                "Content-Type": this.isFormData
                    ? ContentTypeEnum.FORM_DATA
                    : ContentTypeEnum.JSON,
            },
        };
        
        return this.executeFetch<TResponse>(config);
    }

    /**
     * Updates multiple existing items in a single request.
     * @template TResponse The expected response type
     * @template TData The type of data items to send
     * @param options - Options including data array, options, and optional url override
     * @returns A promise that resolves with the response data
     */
    static bulkUpdate<TResponse = unknown, TData = unknown>(
        options: BulkUpdateOptions<TData>
    ): Promise<TResponse> {
        this.validateResource();
        const { data, url } = options;
        const baseUrl = url || this.resource;
        const finalUrl = this.buildUrl(baseUrl, 'bulk');
        const transformedData = this.isFormData
            ? data.map((item: TData) => this.transformData(item))
            : data;
        
        const config: FetcherConfig = {
            method: "PUT",
            url: finalUrl,
            data: transformedData,
            headers: {
                ...this.headers,
                "Content-Type": this.isFormData
                    ? ContentTypeEnum.FORM_DATA
                    : ContentTypeEnum.JSON,
            },
        };
        
        return this.executeFetch<TResponse>(config);
    }

    /**
     * Partially updates an existing item by its ID.
     * @template TResponse The expected response type
     * @template TData The type of data to send (partial)
     * @param options - Options including id, data, options, and optional url override
     * @returns A promise that resolves with the response data
     */
    static patch<TResponse = unknown, TData = unknown>(
        options: PatchOptions<TData>
    ): Promise<TResponse> {
        this.validateResource();
        const { id, data, url } = options;
        const baseUrl = url || this.resource;
        const finalUrl = this.buildUrl(baseUrl, String(id));
        const transformedData = this.transformData(data);
        
        const config: FetcherConfig = {
            method: "PATCH",
            url: finalUrl,
            data: transformedData,
            headers: {
                ...this.headers,
                "Content-Type": this.isFormData
                    ? ContentTypeEnum.FORM_DATA
                    : ContentTypeEnum.JSON,
            },
        };
        
        return this.executeFetch<TResponse>(config);
    }

    /**
     * Deletes an item by its ID.
     * @template TResponse The expected response type
     * @param options - Options including id, options, and optional url override
     * @returns A promise that resolves with the response data
     */
    static delete<TResponse = unknown>(options: DeleteOptions): Promise<TResponse> {
        this.validateResource();
        const { id, url } = options;
        const baseUrl = url || this.resource;
        const finalUrl = this.buildUrl(baseUrl, String(id));
        
        const config: FetcherConfig = {
            method: "DELETE",
            url: finalUrl,
            headers: this.headers,
        };
        
        return this.executeFetch<TResponse>(config);
    }

    /**
     * Deletes multiple items by their IDs in a single request.
     * @template TResponse The expected response type
     * @param options - Options including ids array, options, and optional url override
     * @returns A promise that resolves with the response data
     */
    static bulkDelete<TResponse = unknown>(options: BulkDeleteOptions): Promise<TResponse> {
        this.validateResource();
        const { ids, url } = options;
        const baseUrl = url || this.resource;
        const finalUrl = this.buildUrl(baseUrl, 'bulk');
        
        const config: FetcherConfig = {
            method: "DELETE",
            url: finalUrl,
            data: { ids },
            headers: this.headers,
        };
        
        return this.executeFetch<TResponse>(config);
    }

    /**
     * Creates a new item or updates an existing one, based on the presence of an `id` property in the data.
     * @template TResponse The expected response type
     * @template TData The type of data to send (must have optional id)
     * @param options - Options including data, options, and optional url override
     * @returns A promise that resolves with the response data
     */
    static upsert<TResponse = unknown, TData = unknown>(
        options: UpsertOptions<TData>
    ): Promise<TResponse> {
        // Treat any defined id (including 0 and '') as "update". Using a plain
        // truthiness check misrouted id=0 to create().
        if (options.data.id !== undefined && options.data.id !== null) {
            return this.update<TResponse, TData>({
                id: options.data.id,
                data: options.data,
                url: options.url,
            });
        } else {
            return this.create<TResponse, TData>({
                data: options.data,
                url: options.url,
            });
        }
    }

    /**
     * Makes a custom HTTP request, providing full flexibility over the method, URL, and data.
     * @template TResponse The expected response type
     * @template TParams The type of query parameters
     * @template TData The type of request body data
     * @param options - Options including method, url, params, data, and options
     * @returns A promise that resolves with the response data
     */
    static customRequest<TResponse = unknown, TParams extends Record<string, unknown> = Record<string, unknown>, TData = unknown>(
        options: CustomRequestOptions<TParams, TData>
    ): Promise<TResponse> {
        const { method, url, params, data } = options;
        const transformedData = this.transformData(data);
        
        const config: FetcherConfig = {
            method: method,
            url: url,
            params: params,
            data: transformedData,
            headers: {
                ...this.headers,
                "Content-Type": this.isFormData
                    ? ContentTypeEnum.FORM_DATA
                    : ContentTypeEnum.JSON,
            },
        };
        
        return this.executeFetch<TResponse>(config);
    }
}
