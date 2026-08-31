import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Fetcher } from '@/types/Fetcher';

// This module holds singleton state, and "throws when unconfigured" would
// be order-dependent (flaky) against whatever prior test configured it
// first — so every test gets its own fresh module instance.
beforeEach(() => {
    vi.resetModules();
});

describe('authFetcher', () => {
    it('throws a clear error when neither a fetcher nor a factory has been configured', async () => {
        const { getDefaultAuthFetcher } = await import('./authFetcher');
        expect(() => getDefaultAuthFetcher()).toThrow(/Auth fetcher not configured/);
    });

    it('returns the explicitly configured fetcher', async () => {
        const { configAuthFetcher, getDefaultAuthFetcher } = await import('./authFetcher');
        const fetcher: Fetcher = async () => 'result';
        configAuthFetcher(fetcher);
        expect(getDefaultAuthFetcher()).toBe(fetcher);
    });

    it('lazily creates the fetcher from the factory, only once', async () => {
        const { setDefaultAuthFetcherFactory, getDefaultAuthFetcher } = await import('./authFetcher');
        const fetcher: Fetcher = async () => 'result';
        let calls = 0;
        setDefaultAuthFetcherFactory(() => {
            calls++;
            return fetcher;
        });

        expect(calls).toBe(0); // not called just by registering the factory
        const first = getDefaultAuthFetcher();
        const second = getDefaultAuthFetcher();
        expect(first).toBe(fetcher);
        expect(second).toBe(fetcher);
        expect(calls).toBe(1); // cached after the first resolution
    });

    it('an explicitly configured fetcher takes priority over a factory', async () => {
        const { configAuthFetcher, setDefaultAuthFetcherFactory, getDefaultAuthFetcher } = await import(
            './authFetcher'
        );
        const explicit: Fetcher = async () => 'explicit';
        const fromFactory: Fetcher = async () => 'factory';
        setDefaultAuthFetcherFactory(() => fromFactory);
        configAuthFetcher(explicit);
        expect(getDefaultAuthFetcher()).toBe(explicit);
    });
});
