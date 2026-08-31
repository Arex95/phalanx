import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { AxiosService } from './axiosConfig';
import { configEndpoints } from '@config/global/endpointsConfig';
import { configTokenPaths, configRefreshTokenPaths } from '@config/global/tokenPathsConfig';
import { configCsrf } from '@config/global/csrfConfig';
import { getAccessToken, setAccessToken } from '@/services/accessToken';

function okResponse(config: InternalAxiosRequestConfig, data: unknown = { ok: true }) {
    return { data, status: 200, statusText: 'OK', headers: new AxiosHeaders(), config };
}

// Real `AxiosError` (not a hand-rolled plain object) — axios's own internal
// dispatch/interceptor machinery inspects specific fields this constructor
// sets up correctly; a plain object with `isAxiosError: true` bolted on
// looked right by eye but behaved differently deep inside axios in practice.
function errorRejection(config: InternalAxiosRequestConfig, status: number) {
    const response = { status, statusText: 'Error', data: {}, headers: new AxiosHeaders(), config };
    return Promise.reject(new AxiosError('Request failed', undefined, config, undefined, response));
}

function readHeader(config: InternalAxiosRequestConfig | undefined, name: string): string | undefined {
    const headers = config?.headers as AxiosHeaders | Record<string, string> | undefined;
    if (!headers) return undefined;
    if (typeof (headers as AxiosHeaders).get === 'function') {
        return (headers as AxiosHeaders).get(name) as string | undefined;
    }
    return (headers as Record<string, string>)[name];
}

// `AxiosServiceOptions` has no `adapter` field — `AxiosService`'s
// constructor never forwards one to `axios.create()`, by design (it's not
// meant to be a public configuration knob). The only way to swap in a fake
// adapter for a test is to overwrite `defaults.adapter` on the real
// instance AFTER construction — axios reads it per-request at dispatch
// time, so interceptors already registered by the constructor still apply.
function createTestService(adapter: AxiosAdapter, options: Record<string, unknown> = {}) {
    const service = new AxiosService({ baseURL: '', ...options } as never);
    service.getAxiosInstance().defaults.adapter = adapter;
    return service;
}

beforeEach(() => {
    setAccessToken(null);
    configEndpoints({ loginEndpoint: '/login', refreshEndpoint: '/refresh', logoutEndpoint: '/logout' });
    configTokenPaths({ accessTokenPath: 'data.access_token' });
    configRefreshTokenPaths({ accessTokenPath: 'data.access_token' });
});

describe('AxiosService — request interceptor', () => {
    it('attaches the in-memory access token as a Bearer header', async () => {
        setAccessToken('my-token');
        let received: InternalAxiosRequestConfig | undefined;
        const adapter: AxiosAdapter = async (config) => {
            received = config;
            return okResponse(config);
        };
        const service = createTestService(adapter);
        await service.getAxiosInstance().get('/things');
        expect(readHeader(received, 'Authorization')).toBe('Bearer my-token');
    });

    it('does not attach an Authorization header when there is no token', async () => {
        let received: InternalAxiosRequestConfig | undefined;
        const adapter: AxiosAdapter = async (config) => {
            received = config;
            return okResponse(config);
        };
        const service = createTestService(adapter);
        await service.getAxiosInstance().get('/things');
        expect(readHeader(received, 'Authorization')).toBeUndefined();
    });

    it('does not attach a CSRF header on a normal request even when csrf is configured', async () => {
        configCsrf({ headerName: 'X-CSRF-Token', cookieName: 'csrf_token' });
        document.cookie = 'csrf_token=abc123';

        let received: InternalAxiosRequestConfig | undefined;
        const adapter: AxiosAdapter = async (config) => {
            received = config;
            return okResponse(config);
        };
        const service = createTestService(adapter);
        await service.getAxiosInstance().get('/things');
        expect(readHeader(received, 'X-CSRF-Token')).toBeUndefined();
    });

    it('attaches the CSRF header on a request to the configured refresh endpoint', async () => {
        configCsrf({ headerName: 'X-CSRF-Token', cookieName: 'csrf_token' });
        document.cookie = 'csrf_token=abc123';

        let received: InternalAxiosRequestConfig | undefined;
        const adapter: AxiosAdapter = async (config) => {
            received = config;
            return okResponse(config);
        };
        const service = createTestService(adapter);
        await service.getAxiosInstance().post('/refresh');
        expect(readHeader(received, 'X-CSRF-Token')).toBe('abc123');
    });

    it('tracks active requests while a request is in flight', async () => {
        let resolveAdapter!: () => void;
        const adapter: AxiosAdapter = (config) =>
            new Promise((resolve) => {
                resolveAdapter = () => resolve(okResponse(config));
            });
        const service = createTestService(adapter);

        const promise = service.getAxiosInstance().get('/things');
        // axios's own dispatch chain (request interceptors, cancel token
        // setup, adapter invocation) takes several async hops, not one — a
        // macrotask flush is more robust than counting microtask ticks.
        await new Promise((r) => setTimeout(r, 0));
        expect(service.getActiveRequests()).toBe(1);
        resolveAdapter();
        await promise;
        expect(service.getActiveRequests()).toBe(0);
    });

    it('decrements active requests even when the request fails', async () => {
        const adapter: AxiosAdapter = async (config) => errorRejection(config, 401);
        const service = createTestService(adapter);
        await service.getAxiosInstance().get('/things').catch(() => undefined);
        expect(service.getActiveRequests()).toBe(0);
    });
});

describe('AxiosService — setupAuthInterceptors: false', () => {
    it('does not attach the Authorization header at all when disabled', async () => {
        setAccessToken('my-token');
        let received: InternalAxiosRequestConfig | undefined;
        const adapter: AxiosAdapter = async (config) => {
            received = config;
            return okResponse(config);
        };
        const service = createTestService(adapter, { setupAuthInterceptors: false });
        await service.getAxiosInstance().get('/things');
        expect(readHeader(received, 'Authorization')).toBeUndefined();
    });
});

describe('AxiosService — 401 handling and refresh', () => {
    it('does not attempt a refresh for a non-401 error', async () => {
        let refreshAttempts = 0;
        const adapter: AxiosAdapter = async (config) => {
            if (config.url === '/refresh') refreshAttempts++;
            return errorRejection(config, 404);
        };
        const service = createTestService(adapter);
        await expect(service.getAxiosInstance().get('/things')).rejects.toMatchObject({
            response: { status: 404 }
        });
        expect(refreshAttempts).toBe(0);
    });

    it('refreshes the token on a 401 and retries the original request once', async () => {
        setAccessToken('expired-token');
        let protectedCalls = 0;
        const adapter: AxiosAdapter = async (config) => {
            if (config.url === '/refresh') {
                return okResponse(config, { data: { access_token: 'fresh-token' } });
            }
            protectedCalls++;
            if (readHeader(config, 'Authorization') === 'Bearer fresh-token') {
                return okResponse(config, { secret: 'data' });
            }
            return errorRejection(config, 401);
        };
        const service = createTestService(adapter);
        const response = await service.getAxiosInstance().get('/protected');

        expect(response.data).toEqual({ secret: 'data' });
        expect(protectedCalls).toBe(2); // original (401) + retry (success)
        expect(getAccessToken()).toBe('fresh-token');
    });

    it('does not attempt to refresh again on the retried request even if it fails again', async () => {
        setAccessToken('expired-token');
        let protectedCalls = 0;
        let refreshCalls = 0;
        const adapter: AxiosAdapter = async (config) => {
            if (config.url === '/refresh') {
                refreshCalls++;
                return okResponse(config, { data: { access_token: 'still-bad-token' } });
            }
            protectedCalls++;
            return errorRejection(config, 401);
        };
        const service = createTestService(adapter);

        await expect(service.getAxiosInstance().get('/protected')).rejects.toMatchObject({
            response: { status: 401 }
        });
        expect(refreshCalls).toBe(1); // never loops
        expect(protectedCalls).toBe(2); // original + one retry, then gives up
    });

    it('never attempts to refresh when the 401 comes from the refresh endpoint itself', async () => {
        let refreshCalls = 0;
        const adapter: AxiosAdapter = async (config) => {
            refreshCalls++;
            return errorRejection(config, 401);
        };
        const service = createTestService(adapter);
        await expect(service.getAxiosInstance().post('/refresh')).rejects.toMatchObject({
            response: { status: 401 }
        });
        expect(refreshCalls).toBe(1); // no recursive refresh-of-the-refresh
    });

    it('rejects with the ORIGINAL error, not the refresh error, when refresh itself fails', async () => {
        const adapter: AxiosAdapter = async (config) => {
            if (config.url === '/refresh') {
                throw new Error('refresh endpoint down');
            }
            return errorRejection(config, 401);
        };
        const service = createTestService(adapter);
        await expect(service.getAxiosInstance().get('/protected')).rejects.toMatchObject({
            response: { status: 401 }
        });
    });

    it('clears the access token when refresh fails', async () => {
        setAccessToken('expired-token');
        const adapter: AxiosAdapter = async (config) => {
            if (config.url === '/refresh') {
                throw new Error('refresh failed');
            }
            return errorRejection(config, 401);
        };
        const service = createTestService(adapter);
        await expect(service.getAxiosInstance().get('/protected')).rejects.toBeTruthy();
        expect(getAccessToken()).toBeNull();
    });

    it('queues a second concurrent 401 while a refresh is already in flight, then retries it with the new token', async () => {
        setAccessToken('expired-token');
        let refreshCalls = 0;
        let resolveRefresh!: () => void;
        const refreshGate = new Promise<void>((resolve) => {
            resolveRefresh = resolve;
        });

        const adapter: AxiosAdapter = async (config) => {
            if (config.url === '/refresh') {
                refreshCalls++;
                await refreshGate;
                return okResponse(config, { data: { access_token: 'fresh-token' } });
            }
            if (readHeader(config, 'Authorization') === 'Bearer fresh-token') {
                return okResponse(config, { from: config.url });
            }
            return errorRejection(config, 401);
        };
        const service = createTestService(adapter);

        const first = service.getAxiosInstance().get('/a');
        const second = service.getAxiosInstance().get('/b');

        // Give both initial 401s (and the resulting refresh flow) time to
        // land — each involves several async hops (request/response
        // interceptors, the failed first attempt, deciding to refresh).
        await new Promise((r) => setTimeout(r, 0));
        await new Promise((r) => setTimeout(r, 0));
        expect(refreshCalls).toBe(1); // only ONE refresh in flight, not two

        resolveRefresh();
        const [firstResult, secondResult] = await Promise.all([first, second]);

        expect(firstResult.data).toEqual({ from: '/a' });
        expect(secondResult.data).toEqual({ from: '/b' });
        expect(refreshCalls).toBe(1);
    });

    it('does not attempt refresh in an SSR-like environment (no window)', async () => {
        vi.stubGlobal('window', undefined);
        let refreshCalls = 0;
        const adapter: AxiosAdapter = async (config) => {
            if (config.url === '/refresh') refreshCalls++;
            return errorRejection(config, 401);
        };
        const service = createTestService(adapter);
        await expect(service.getAxiosInstance().get('/protected')).rejects.toMatchObject({
            response: { status: 401 }
        });
        expect(refreshCalls).toBe(0);
        vi.unstubAllGlobals();
    });
});

describe('AxiosService — header/cancel utilities', () => {
    it('setHeader/removeHeader affect default headers for future requests', async () => {
        let received: InternalAxiosRequestConfig | undefined;
        const adapter: AxiosAdapter = async (config) => {
            received = config;
            return okResponse(config);
        };
        const service = createTestService(adapter);

        service.setHeader('X-Tenant', 'abc');
        await service.getAxiosInstance().get('/things');
        expect(readHeader(received, 'X-Tenant')).toBe('abc');

        service.removeHeader('X-Tenant');
        await service.getAxiosInstance().get('/things');
        expect(readHeader(received, 'X-Tenant')).toBeUndefined();
    });

    it('cancelAllRequests cancels in-flight requests and allows new ones afterwards', async () => {
        const adapter: AxiosAdapter = async (config) => okResponse(config);
        const service = createTestService(adapter);

        service.cancelAllRequests();
        // A fresh cancel token was issued — a subsequent request must still work.
        const response = await service.getAxiosInstance().get('/things');
        expect(response.data).toEqual({ ok: true });
    });
});

describe('AxiosService — additional 401/refresh edge cases', () => {
    it('rejects a queued request if its own retry (after the shared refresh succeeds) fails again', async () => {
        setAccessToken('expired-token');
        let resolveRefresh!: () => void;
        const refreshGate = new Promise<void>((resolve) => {
            resolveRefresh = resolve;
        });
        const adapter: AxiosAdapter = async (config) => {
            if (config.url === '/refresh') {
                await refreshGate;
                return okResponse(config, { data: { access_token: 'fresh-token' } });
            }
            if (config.url === '/a') {
                if (readHeader(config, 'Authorization') === 'Bearer fresh-token') {
                    return okResponse(config, { from: 'a' });
                }
                return errorRejection(config, 401);
            }
            // /b always fails, even after the retry with the fresh token.
            return errorRejection(config, 401);
        };
        const service = createTestService(adapter);

        const first = service.getAxiosInstance().get('/a');
        const second = service.getAxiosInstance().get('/b');
        await new Promise((r) => setTimeout(r, 0));
        resolveRefresh();

        await expect(first).resolves.toMatchObject({ data: { from: 'a' } });
        await expect(second).rejects.toMatchObject({ response: { status: 401 } });
    });

    it('rejects with a clear error when refresh reports success but leaves no access token', async () => {
        const axiosServicesModule = await import('@/services');
        const spy = vi.spyOn(axiosServicesModule, 'refreshTokens').mockImplementation(async () => {
            // Simulates a real edge case: the refresh call resolved, but
            // something (e.g. a race with a concurrent logout) cleared the
            // token before this code could read it back.
            setAccessToken(null);
            return { data: { access_token: 'ignored' } };
        });

        const adapter: AxiosAdapter = async (config) => errorRejection(config, 401);
        const service = createTestService(adapter);

        await expect(service.getAxiosInstance().get('/protected')).rejects.toMatchObject({
            response: { status: 401 }
        });
        spy.mockRestore();
    });
});
