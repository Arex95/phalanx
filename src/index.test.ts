import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'vue';
import type { PhalanxOptions } from './types/PhalanxOptions';

const app = {} as App;

const baseOptions: PhalanxOptions = {
    endpoints: { login: '/auth/login', refresh: '/auth/refresh', logout: '/auth/logout' },
    tokenPaths: { accessToken: 'data.accessToken' },
    axios: { baseURL: 'https://api.example.com' }
};

async function install(options: PhalanxOptions) {
    const { Phalanx } = await import('./index');
    const { getTokenPathsConfig, getRefreshResponsePathsConfig } = await import(
        './config/global/tokenPathsConfig'
    );
    Phalanx.install(app, options);
    return { getTokenPathsConfig, getRefreshResponsePathsConfig };
}

describe('Phalanx.install', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it('throws when no options are given', async () => {
        const { Phalanx } = await import('./index');
        expect(() => Phalanx.install(app, undefined as unknown as PhalanxOptions)).toThrow(
            /No configuration options/
        );
    });

    it('reads the access token path for the login response', async () => {
        const { getTokenPathsConfig } = await install(baseOptions);
        expect(getTokenPathsConfig().accessTokenPath).toBe('data.accessToken');
    });

    it('falls back to tokenPaths when refreshResponsePaths is omitted', async () => {
        const { getRefreshResponsePathsConfig } = await install(baseOptions);
        expect(getRefreshResponsePathsConfig().accessTokenPath).toBe('data.accessToken');
    });

    it('uses refreshResponsePaths when the refresh response differs', async () => {
        const { getTokenPathsConfig, getRefreshResponsePathsConfig } = await install({
            ...baseOptions,
            refreshResponsePaths: { accessToken: 'access_token' }
        });
        expect(getTokenPathsConfig().accessTokenPath).toBe('data.accessToken');
        expect(getRefreshResponsePathsConfig().accessTokenPath).toBe('access_token');
    });

    it('does not let the two paths drift when only the login one is set', async () => {
        const { getTokenPathsConfig, getRefreshResponsePathsConfig } = await install({
            ...baseOptions,
            tokenPaths: { accessToken: 'result.jwt' }
        });
        expect(getRefreshResponsePathsConfig().accessTokenPath).toBe(
            getTokenPathsConfig().accessTokenPath
        );
    });
});
