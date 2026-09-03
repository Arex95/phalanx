import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AxiosInstance } from 'axios';

/** axios does not type `handlers`; the count is what these tests assert on. */
function requestInterceptorCount(instance: AxiosInstance): number {
    const { handlers } = instance.interceptors.request as unknown as {
        handlers: Array<unknown | null>;
    };
    return handlers.filter(Boolean).length;
}

/**
 * `configAxios` must reconfigure the singleton, never replace it.
 *
 * Replacing it left every interceptor a consumer had registered before the
 * plugin was installed attached to an instance nothing used again. Nothing
 * threw: the requests kept working, just without the header.
 */
describe('configAxios reconfigures in place', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it('keeps the same axios instance across configuration', async () => {
        const { getConfiguredAxiosInstance, configAxios } = await import('./axiosInstance');

        const before = getConfiguredAxiosInstance();
        configAxios({ baseURL: 'https://api.example.com' });
        const after = getConfiguredAxiosInstance();

        expect(after).toBe(before);
    });

    it('preserves an interceptor registered before the plugin is installed', async () => {
        const { getConfiguredAxiosInstance, configAxios } = await import('./axiosInstance');
        const { createHeaderInterceptor } = await import('../../http/headerInterceptor');

        createHeaderInterceptor({ header: 'X-Tenant', value: () => 'acme' });
        const instance = getConfiguredAxiosInstance();
        const before = requestInterceptorCount(instance);

        configAxios({ baseURL: 'https://api.example.com' });

        expect(requestInterceptorCount(getConfiguredAxiosInstance()))
            .toBe(before);
    });

    it('applies the new options to that instance', async () => {
        const { getConfiguredAxiosInstance, configAxios } = await import('./axiosInstance');

        configAxios({
            baseURL: 'https://api.example.com',
            timeout: 5_000,
            withCredentials: true
        });

        const instance = getConfiguredAxiosInstance();
        expect(instance.defaults.baseURL).toBe('https://api.example.com');
        expect(instance.defaults.timeout).toBe(5_000);
        expect(instance.defaults.withCredentials).toBe(true);
    });

    it('merges headers instead of dropping the previous ones', async () => {
        const { getConfiguredAxiosInstance, configAxios } = await import('./axiosInstance');

        configAxios({ baseURL: 'https://a.example.com', headers: { 'X-One': '1' } });
        configAxios({ baseURL: 'https://b.example.com', headers: { 'X-Two': '2' } });

        const headers = getConfiguredAxiosInstance().defaults.headers as Record<string, unknown>;
        expect(headers['X-One']).toBe('1');
        expect(headers['X-Two']).toBe('2');
    });

    it('removes the auth interceptors when reconfigured with setupAuthInterceptors false', async () => {
        const { getConfiguredAxiosInstance, configAxios } = await import('./axiosInstance');

        configAxios({ baseURL: 'https://api.example.com' });
        const withAuth = requestInterceptorCount(getConfiguredAxiosInstance());

        configAxios({ baseURL: 'https://api.example.com', setupAuthInterceptors: false });
        const withoutAuth = requestInterceptorCount(getConfiguredAxiosInstance());

        expect(withoutAuth).toBe(withAuth - 1);
    });

    it('does not stack a second auth interceptor when configured twice', async () => {
        const { getConfiguredAxiosInstance, configAxios } = await import('./axiosInstance');

        configAxios({ baseURL: 'https://api.example.com' });
        const once = requestInterceptorCount(getConfiguredAxiosInstance());

        configAxios({ baseURL: 'https://api.example.com' });
        expect(requestInterceptorCount(getConfiguredAxiosInstance()))
            .toBe(once);
    });
});
