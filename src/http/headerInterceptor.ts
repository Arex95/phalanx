import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { getConfiguredAxiosInstance } from '../config/axios/axiosInstance';

export interface HeaderInterceptorOptions {
    /** Header to set, e.g. `X-Tenant-ID`. */
    header: string;
    /**
     * Value for the current request. Returning `null` or `undefined` leaves the
     * request untouched, which is what you want before the value is known.
     */
    value: () => string | null | undefined;
    /**
     * Restricts the header to matching request URLs. A `RegExp` is tested
     * against the resolved URL; a function receives it. Omitted, every request
     * carries the header.
     */
    match?: RegExp | ((url: string) => boolean);
    /** Exceptions to `match`, tested the same way. */
    exempt?: Array<RegExp | ((url: string) => boolean)>;
    /** Defaults to the instance the plugin configured. */
    instance?: AxiosInstance;
}

function matches(rule: RegExp | ((url: string) => boolean), url: string): boolean {
    return rule instanceof RegExp ? rule.test(url) : rule(url);
}

function resolveUrl(config: InternalAxiosRequestConfig): string {
    const url = config.url ?? '';
    if (url.startsWith('http')) return url;
    const baseURL = config.baseURL ?? '';
    return `${baseURL.replace(/\/$/, '')}/${url.replace(/^\//, '')}`;
}

/**
 * Attaches a request header whose value is only known at call time — a tenant,
 * a branch, a workspace.
 *
 * ```ts
 * const stop = createHeaderInterceptor({
 *     header: 'X-Branch-ID',
 *     value: () => activeBranch.value?.uuid,
 *     match: /\/admin\//,
 *     exempt: [/\/admin\/users\/me(\/|$|\?)/]
 * });
 * ```
 *
 * Returns a function that removes the interceptor. Registering the same header
 * twice would send it twice, so keep the handle if the caller can run more than
 * once.
 */
export function createHeaderInterceptor(options: HeaderInterceptorOptions): () => void {
    const instance = options.instance ?? getConfiguredAxiosInstance();

    const id = instance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
        const url = resolveUrl(config);

        if (options.match && !matches(options.match, url)) return config;
        if (options.exempt?.some((rule) => matches(rule, url))) return config;

        const value = options.value();
        if (value === null || value === undefined || value === '') return config;

        config.headers.set(options.header, value);
        return config;
    });

    return () => instance.interceptors.request.eject(id);
}
