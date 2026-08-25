// @ts-expect-error - ofetch is an optional peer dependency (type-only import)
import type { FetchOptions } from 'ofetch';
import { Fetcher, FetcherConfig } from '../types/Fetcher';
import { normalizeHttpError } from '../errors';

/**
 * Creates a fetcher backed by `ofetch`. The dependency is imported lazily so
 * merely importing this library does not eagerly resolve `ofetch` — that is
 * what makes it a genuinely optional peer dependency.
 *
 * @example
 * ```typescript
 * export class Role extends RestStd {
 *     static override resource = 'roles';
 *     static fetchFn = createOfetchFetcher('https://api.example.com');
 * }
 * ```
 */
export function createOfetchFetcher(
    baseURL?: string,
    defaultOptions?: FetchOptions
): Fetcher {
    return async (config: FetcherConfig): Promise<unknown> => {
        const url = baseURL
            ? `${baseURL.replace(/\/$/, '')}/${config.url.replace(/^\//, '')}`
            : config.url;

        try {
            // @ts-expect-error - ofetch is an optional peer dependency, resolved at runtime
            const { $fetch } = await import('ofetch');
            return await $fetch(url, {
                method: config.method,
                query: config.params,
                body: config.data,
                headers: config.headers,
                ...defaultOptions,
            });
        } catch (error) {
            throw normalizeHttpError(error);
        }
    };
}
