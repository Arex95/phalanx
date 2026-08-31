import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from './useAuth';
import { getAccessToken, setAccessToken } from '@services/accessToken';
import { configEndpoints } from '@config/global/endpointsConfig';
import { configTokenPaths } from '@config/global/tokenPathsConfig';
import { configCallbacks } from '@config/global/callbacksConfig';
import type { Fetcher, FetcherConfig } from '@/types';

beforeEach(() => {
    setAccessToken(null);
    configEndpoints({ loginEndpoint: '/login', refreshEndpoint: '/refresh', logoutEndpoint: '/logout' });
    configTokenPaths({ accessTokenPath: 'data.access_token' });
    configCallbacks({});
});

describe('useAuth().login', () => {
    it('POSTs to the login endpoint with the given params as the body', async () => {
        let received: FetcherConfig | undefined;
        const fetcher: Fetcher = async (config) => {
            received = config;
            return { data: { access_token: 'x' } };
        };
        const { login } = useAuth(fetcher);
        await login({ email: 'a@b.com', password: 'secret' });

        expect(received).toEqual({
            method: 'POST',
            url: '/login',
            data: { email: 'a@b.com', password: 'secret' }
        });
    });

    it('extracts and stores the access token, and returns the raw response', async () => {
        const response = { data: { access_token: 'my-token' } };
        const { login } = useAuth(async () => response);
        const result = await login({});
        expect(getAccessToken()).toBe('my-token');
        expect(result).toBe(response);
    });

    it('defaults params to an empty object when called with none', async () => {
        let received: FetcherConfig | undefined;
        const { login } = useAuth(async (config) => {
            received = config;
            return { data: { access_token: 'x' } };
        });
        await login();
        expect(received?.data).toEqual({});
    });

    it('propagates the fetcher error without swallowing it', async () => {
        const loginError = new Error('invalid credentials');
        const { login } = useAuth(async () => {
            throw loginError;
        });
        await expect(login({})).rejects.toBe(loginError);
    });

    it('does not store a token when the response has no valid token — and propagates the extraction error', async () => {
        const { login } = useAuth(async () => ({ data: {} }));
        await expect(login({})).rejects.toThrow(/LOGIN_ERROR/);
        expect(getAccessToken()).toBeNull();
    });

    it('accepts an explicit tokenPaths override instead of the global config', async () => {
        const { login } = useAuth(async () => ({ result: { jwt: 'custom-path-token' } }));
        await login({}, { accessTokenPath: 'result.jwt' });
        expect(getAccessToken()).toBe('custom-path-token');
    });

    it('uses the configured default auth fetcher when none is passed to useAuth', async () => {
        const { configAuthFetcher } = await import('@/config/auth/authFetcher');
        configAuthFetcher(async () => ({ data: { access_token: 'from-default' } }));
        const { login } = useAuth();
        await login({});
        expect(getAccessToken()).toBe('from-default');
    });
});

describe('useAuth().logout', () => {
    it('POSTs to the logout endpoint with the given params', async () => {
        let received: FetcherConfig | undefined;
        const { logout } = useAuth(async (config) => {
            received = config;
            return undefined;
        });
        await logout({ refreshToken: 'abc' });
        expect(received).toEqual({ method: 'POST', url: '/logout', data: { refreshToken: 'abc' } });
    });

    it('defaults params to an empty object', async () => {
        let received: FetcherConfig | undefined;
        const { logout } = useAuth(async (config) => {
            received = config;
        });
        await logout();
        expect(received?.data).toEqual({});
    });

    it('clears the access token even when the fetcher succeeds', async () => {
        setAccessToken('stale');
        const { logout } = useAuth(async () => undefined);
        await logout();
        expect(getAccessToken()).toBeNull();
    });

    it('clears the access token AND does not throw when the fetcher fails — logout must proceed locally regardless', async () => {
        setAccessToken('stale');
        const { logout } = useAuth(async () => {
            throw new Error('server unreachable');
        });
        await expect(logout()).resolves.toBeUndefined();
        expect(getAccessToken()).toBeNull();
    });

    it('calls onLogout when configured, instead of reloading the page', async () => {
        const onLogout = vi.fn();
        configCallbacks({ onLogout });
        const reload = vi.fn();
        vi.stubGlobal('location', { ...window.location, reload });

        const { logout } = useAuth(async () => undefined);
        await logout();

        expect(onLogout).toHaveBeenCalledOnce();
        expect(reload).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
    });

    it('falls back to window.location.reload when onLogout is not configured', async () => {
        configCallbacks({});
        const reload = vi.fn();
        vi.stubGlobal('location', { ...window.location, reload });

        const { logout } = useAuth(async () => undefined);
        await logout();

        expect(reload).toHaveBeenCalledOnce();
        vi.unstubAllGlobals();
    });

    it('calls onLogout even when the fetcher throws', async () => {
        const onLogout = vi.fn();
        configCallbacks({ onLogout });
        const { logout } = useAuth(async () => {
            throw new Error('boom');
        });
        await logout();
        expect(onLogout).toHaveBeenCalledOnce();
    });
});
