// @ts-ignore - ofetch is an optional peer dependency (type-only import)
import type { FetchOptions } from 'ofetch';
import { Fetcher, FetcherConfig } from '../types/Fetcher';
import { normalizeHttpError } from '../errors';

/**
 * Creates a fetcher function using ofetch.
 * 
 * @param baseURL - Optional base URL for requests
 * @param defaultOptions - Optional default options for ofetch
 * @returns A fetcher function compatible with RestStd
 * 
 * @example
 * ```typescript
 * import { createOfetchFetcher, RestStd } from '@arex95/vue-core';
 * 
 * export class Role extends RestStd {
 *     static override resource = 'roles';
 *     static fetchFn = createOfetchFetcher('https://api.example.com');
 * }
 * ```
 * 
 * @example
 * ```typescript
 * import { createFetch } from 'ofetch';
 * import { createOfetchFetcher, RestStd } from '@arex95/vue-core';
 * 
 * const ofetchInstance = createFetch({ baseURL: 'https://api.example.com' });
 * 
 * export class Role extends RestStd {
 *     static override resource = 'roles';
 *     static fetchFn = createOfetchFetcher(undefined, { fetch: ofetchInstance });
 * }
 * ```
 */
export function createOfetchFetcher(
    baseURL?: string,
    defaultOptions?: FetchOptions
): Fetcher {
    return async (config: FetcherConfig): Promise<any> => {
        const url = baseURL
            ? `${baseURL.replace(/\/$/, '')}/${config.url.replace(/^\//, '')}`
            : config.url;

        try {
            // Imported lazily so that merely importing the library (its barrel
            // re-exports this module) does not eagerly resolve `ofetch`. This is
            // what makes `ofetch` a genuinely *optional* peer dependency.
            // @ts-ignore - ofetch is an optional peer dependency
            const { $fetch } = await import('ofetch');
            return await $fetch(url, {
                method: config.method as any,
                query: config.params,
                body: config.data,
                headers: config.headers,
                ...defaultOptions,
            });
        } catch (error) {
            // Wrap into the library's error hierarchy so the contract matches
            // the Axios fetcher (NetworkError / ServerError) regardless of runtime.
            throw normalizeHttpError(error);
        }
    };
}

