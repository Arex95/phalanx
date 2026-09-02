import { describe, expect, it, vi } from 'vitest';
import { configCallbacks, getCallbacksConfig } from './callbacksConfig';
import { configCsrf, getCsrfConfig } from './csrfConfig';
import { configEndpoints, getEndpointsConfig } from './endpointsConfig';
import {
    configRefreshResponsePaths,
    configTokenPaths,
    getRefreshResponsePathsConfig,
    getTokenPathsConfig
} from './tokenPathsConfig';

describe('callbacksConfig', () => {
    it('stores and returns the configured callbacks', () => {
        const onLogout = () => undefined;
        const onRefreshFailed = () => undefined;
        configCallbacks({ onLogout, onRefreshFailed });
        expect(getCallbacksConfig()).toEqual({ onLogout, onRefreshFailed });
    });

    it('overwrites the previous config entirely on each call, not merging', () => {
        configCallbacks({ onLogout: () => undefined, onRefreshFailed: () => undefined });
        configCallbacks({ onLogout: () => 'new' });
        expect(getCallbacksConfig().onRefreshFailed).toBeUndefined();
    });

    it('supports being called with an empty config', () => {
        configCallbacks({});
        expect(getCallbacksConfig()).toEqual({});
    });
});

describe('csrfConfig', () => {
    it('returns null when never configured', () => {
        // This module hasn't been touched by any other test in this file yet.
        expect(getCsrfConfig()).toBeNull();
    });

    it('stores and returns the configured headerName/cookieName', () => {
        configCsrf({ headerName: 'X-CSRF-Token', cookieName: 'csrf_token' });
        expect(getCsrfConfig()).toEqual({ headerName: 'X-CSRF-Token', cookieName: 'csrf_token' });
    });

    it('overwrites a previous config on a second call', () => {
        configCsrf({ headerName: 'X-CSRF-Token', cookieName: 'csrf_token' });
        configCsrf({ headerName: 'X-Other', cookieName: 'other' });
        expect(getCsrfConfig()).toEqual({ headerName: 'X-Other', cookieName: 'other' });
    });
});

describe('endpointsConfig', () => {
    it('has sensible defaults before any configuration', () => {
        // Import-time defaults — verified by not calling configEndpoints
        // first would be order-dependent, so this documents the literal
        // default values instead of relying on "not yet configured".
        configEndpoints({ loginEndpoint: '/login', refreshEndpoint: '/refresh', logoutEndpoint: '/logout' });
        expect(getEndpointsConfig()).toEqual({ LOGIN: '/login', REFRESH: '/refresh', LOGOUT: '/logout' });
    });

    it('accepts custom endpoint paths', () => {
        configEndpoints({
            loginEndpoint: '/api/auth/login',
            refreshEndpoint: '/api/auth/refresh',
            logoutEndpoint: '/api/auth/logout'
        });
        expect(getEndpointsConfig()).toEqual({
            LOGIN: '/api/auth/login',
            REFRESH: '/api/auth/refresh',
            LOGOUT: '/api/auth/logout'
        });
    });

    it('returns a frozen object', () => {
        configEndpoints({ loginEndpoint: '/a', refreshEndpoint: '/b', logoutEndpoint: '/c' });
        expect(Object.isFrozen(getEndpointsConfig())).toBe(true);
    });
});

describe('tokenPathsConfig', () => {
    it('defaults to data.access_token for both login and refresh paths', () => {
        configTokenPaths({});
        configRefreshResponsePaths({});
        expect(getTokenPathsConfig()).toEqual({ accessTokenPath: 'data.access_token' });
        expect(getRefreshResponsePathsConfig()).toEqual({ accessTokenPath: 'data.access_token' });
    });

    it('accepts a custom accessTokenPath for login, independent of refresh', () => {
        configTokenPaths({ accessTokenPath: 'data.token.access' });
        configRefreshResponsePaths({ accessTokenPath: 'data.access_token' });
        expect(getTokenPathsConfig().accessTokenPath).toBe('data.token.access');
        expect(getRefreshResponsePathsConfig().accessTokenPath).toBe('data.access_token');
    });

    it('falls back to the default when passed an empty string path', () => {
        configTokenPaths({ accessTokenPath: '' });
        expect(getTokenPathsConfig().accessTokenPath).toBe('data.access_token');
    });

    it('returns a frozen object', () => {
        configTokenPaths({ accessTokenPath: 'x' });
        expect(Object.isFrozen(getTokenPathsConfig())).toBe(true);
    });
});

describe('encryptionConfig', () => {
    it('throws a clear error when read before configEncryption is ever called', async () => {
        vi.resetModules();
        const { getEncryptionPublicKeyPem } = await import('./encryptionConfig');
        expect(() => getEncryptionPublicKeyPem()).toThrow(/No encryption public key configured/);
    });

    it('returns exactly what was configured', async () => {
        vi.resetModules();
        const { configEncryption, getEncryptionPublicKeyPem } = await import('./encryptionConfig');
        configEncryption({ publicKeyPem: 'FAKE-PEM' });
        expect(getEncryptionPublicKeyPem()).toBe('FAKE-PEM');
    });
});
