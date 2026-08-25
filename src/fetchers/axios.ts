import { AxiosInstance } from 'axios';
import { Fetcher, FetcherConfig } from '../types/Fetcher';
import { normalizeHttpError } from '../errors';

/**
 * Creates a fetcher function using Axios.
 * 
 * @param axiosInstance - The Axios instance to use
 * @returns A fetcher function compatible with RestStd
 * 
 * @example
 * ```typescript
 * import axios from 'axios';
 * import { createAxiosFetcher, RestStd } from '@arex95/vue-core';
 * 
 * const axiosInstance = axios.create({ baseURL: 'https://api.example.com' });
 * 
 * export class Role extends RestStd {
 *     static override resource = 'roles';
 *     static fetchFn = createAxiosFetcher(axiosInstance);
 * }
 * ```
 */
export function createAxiosFetcher(axiosInstance: AxiosInstance): Fetcher {
    return async (config: FetcherConfig): Promise<unknown> => {
        try {
            const response = await axiosInstance({
                method: config.method,
                url: config.url,
                params: config.params,
                data: config.data,
                headers: config.headers,
            });
            return response.data;
        } catch (error) {
            throw normalizeHttpError(error);
        }
    };
}
