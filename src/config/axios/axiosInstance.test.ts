import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
    vi.resetModules();
});

describe('configAxios / getConfiguredAxiosInstance', () => {
    it('returns a real AxiosInstance after configAxios', async () => {
        const { configAxios, getConfiguredAxiosInstance } = await import('./axiosInstance');
        configAxios({ baseURL: 'https://api.example.com' });
        const instance = getConfiguredAxiosInstance();
        expect(instance.defaults.baseURL).toBe('https://api.example.com');
    });

    it('returns the same instance on repeated calls (singleton)', async () => {
        const { configAxios, getConfiguredAxiosInstance } = await import('./axiosInstance');
        configAxios({ baseURL: 'https://api.example.com' });
        expect(getConfiguredAxiosInstance()).toBe(getConfiguredAxiosInstance());
    });

    it('lazily creates a minimal default instance when getConfiguredAxiosInstance is called before configAxios', async () => {
        const { getConfiguredAxiosInstance } = await import('./axiosInstance');
        const instance = getConfiguredAxiosInstance();
        expect(instance.defaults.baseURL).toBe('');
        expect(instance.defaults.withCredentials).toBe(false);
    });

    it('registers a default auth fetcher factory backed by the configured instance', async () => {
        const { configAxios } = await import('./axiosInstance');
        const { getDefaultAuthFetcher } = await import('@/config/auth/authFetcher');
        configAxios({ baseURL: '' });
        expect(() => getDefaultAuthFetcher()).not.toThrow();
    });

    it('a fresh default instance also registers a working auth fetcher factory (lazy init path)', async () => {
        const { getConfiguredAxiosInstance } = await import('./axiosInstance');
        const { getDefaultAuthFetcher } = await import('@/config/auth/authFetcher');
        getConfiguredAxiosInstance(); // triggers the lazy-default branch
        expect(() => getDefaultAuthFetcher()).not.toThrow();
    });

    it('passes through headers/timeout/withCredentials to the created instance', async () => {
        const { configAxios, getConfiguredAxiosInstance } = await import('./axiosInstance');
        configAxios({
            baseURL: 'https://x',
            timeout: 5000,
            withCredentials: true,
            headers: { 'X-Custom': 'y' }
        });
        const instance = getConfiguredAxiosInstance();
        expect(instance.defaults.timeout).toBe(5000);
        expect(instance.defaults.withCredentials).toBe(true);
    });
});
