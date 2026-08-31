import { beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshTokens } from './refreshTokens';
import { getAccessToken, setAccessToken } from './accessToken';
import { configEndpoints } from '@config/global/endpointsConfig';
import { configRefreshTokenPaths } from '@config/global/tokenPathsConfig';
import { configCallbacks } from '@config/global/callbacksConfig';
import type { Fetcher, FetcherConfig } from '@/types';

beforeEach(() => {
    setAccessToken(null);
    configEndpoints({ loginEndpoint: '/login', refreshEndpoint: '/refresh', logoutEndpoint: '/logout' });
    configRefreshTokenPaths({ accessTokenPath: 'data.access_token' });
    configCallbacks({});
});

describe('refreshTokens', () => {
    it('POSTs to the configured refresh endpoint with no body', async () => {
        const fetcher: Fetcher = vi.fn(async () => ({ data: { access_token: 'new-token' } }));
        await refreshTokens(fetcher);
        expect(fetcher).toHaveBeenCalledWith({ method: 'POST', url: '/refresh' });
    });

    it('extracts and stores the new access token on success', async () => {
        const fetcher: Fetcher = async () => ({ data: { access_token: 'new-token' } });
        await refreshTokens(fetcher);
        expect(getAccessToken()).toBe('new-token');
    });

    it('returns the raw response data', async () => {
        const response = { data: { access_token: 'x' }, extra: 'field' };
        const fetcher: Fetcher = async () => response;
        const result = await refreshTokens(fetcher);
        expect(result).toBe(response);
    });

    it('uses the configured default auth fetcher when none is passed explicitly', async () => {
        const { configAuthFetcher } = await import('@/config/auth/authFetcher');
        const defaultFetcher: Fetcher = vi.fn(async () => ({ data: { access_token: 'from-default' } }));
        configAuthFetcher(defaultFetcher);

        await refreshTokens();
        expect(defaultFetcher).toHaveBeenCalledOnce();
        expect(getAccessToken()).toBe('from-default');
    });

    it('clears the access token and rethrows when the fetcher itself throws', async () => {
        setAccessToken('stale-token');
        configCallbacks({ onRefreshFailed: () => undefined });
        const networkError = new Error('network down');
        const fetcher: Fetcher = async () => {
            throw networkError;
        };

        await expect(refreshTokens(fetcher)).rejects.toBe(networkError);
        expect(getAccessToken()).toBeNull();
    });

    it('clears the access token and rethrows when the response has no valid token (extraction fails)', async () => {
        setAccessToken('stale-token');
        configCallbacks({ onRefreshFailed: () => undefined });
        const fetcher: Fetcher = async () => ({ data: {} }); // no access_token at the configured path

        await expect(refreshTokens(fetcher)).rejects.toThrow(/REFRESH_ERROR/);
        expect(getAccessToken()).toBeNull();
    });

    it('calls onRefreshFailed when configured, on any failure', async () => {
        const onRefreshFailed = vi.fn();
        configCallbacks({ onRefreshFailed });
        const fetcher: Fetcher = async () => {
            throw new Error('boom');
        };

        await expect(refreshTokens(fetcher)).rejects.toThrow('boom');
        expect(onRefreshFailed).toHaveBeenCalledOnce();
    });

    it('falls back to window.location.reload when onRefreshFailed is not configured', async () => {
        configCallbacks({}); // no onRefreshFailed
        const reload = vi.fn();
        vi.stubGlobal('location', { ...window.location, reload });

        const fetcher: Fetcher = async () => {
            throw new Error('boom');
        };
        await expect(refreshTokens(fetcher)).rejects.toThrow('boom');
        expect(reload).toHaveBeenCalledOnce();

        vi.unstubAllGlobals();
    });

    it('does not call onRefreshFailed on success', async () => {
        const onRefreshFailed = vi.fn();
        configCallbacks({ onRefreshFailed });
        const fetcher: Fetcher = async () => ({ data: { access_token: 'ok' } });

        await refreshTokens(fetcher);
        expect(onRefreshFailed).not.toHaveBeenCalled();
    });

    it('sends no data/params — relies entirely on the browser-attached cookie', async () => {
        let received: FetcherConfig | undefined;
        const fetcher: Fetcher = async (config) => {
            received = config;
            return { data: { access_token: 'x' } };
        };
        await refreshTokens(fetcher);
        expect(received?.data).toBeUndefined();
        expect(received?.params).toBeUndefined();
    });
});
