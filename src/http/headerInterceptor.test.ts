import { beforeEach, describe, expect, it } from 'vitest';
import axios, { type InternalAxiosRequestConfig } from 'axios';
import { createHeaderInterceptor } from './headerInterceptor';

function makeInstance() {
    return axios.create({ baseURL: 'https://api.example.com/api' });
}

/** Runs the registered request interceptors over a config, as axios would. */
async function run(instance: ReturnType<typeof makeInstance>, url: string) {
    let config = {
        url,
        baseURL: instance.defaults.baseURL,
        headers: new axios.AxiosHeaders()
    } as InternalAxiosRequestConfig;

    for (const handler of (instance.interceptors.request as never as {
        handlers: Array<{ fulfilled: (c: InternalAxiosRequestConfig) => InternalAxiosRequestConfig } | null>;
    }).handlers) {
        if (handler) config = await handler.fulfilled(config);
    }
    return config;
}

describe('createHeaderInterceptor', () => {
    let instance: ReturnType<typeof makeInstance>;

    beforeEach(() => {
        instance = makeInstance();
    });

    it('sets the header on every request when no match is given', async () => {
        createHeaderInterceptor({ header: 'X-Tenant', value: () => 'acme', instance });
        const config = await run(instance, 'users');
        expect(config.headers.get('X-Tenant')).toBe('acme');
    });

    it('only sets it on matching urls', async () => {
        createHeaderInterceptor({
            header: 'X-Branch-ID',
            value: () => 'b-1',
            match: /\/admin\//,
            instance
        });
        expect((await run(instance, 'admin/users')).headers.get('X-Branch-ID')).toBe('b-1');
        expect((await run(instance, 'public/status')).headers.get('X-Branch-ID')).toBeUndefined();
    });

    it('honours exemptions inside a match', async () => {
        createHeaderInterceptor({
            header: 'X-Branch-ID',
            value: () => 'b-1',
            match: /\/admin\//,
            exempt: [/\/admin\/users\/me(\/|$|\?)/],
            instance
        });
        expect((await run(instance, 'admin/users')).headers.get('X-Branch-ID')).toBe('b-1');
        expect((await run(instance, 'admin/users/me')).headers.get('X-Branch-ID')).toBeUndefined();
    });

    it('accepts predicates as well as patterns', async () => {
        createHeaderInterceptor({
            header: 'X-Tenant',
            value: () => 'acme',
            match: (url) => url.endsWith('/reports'),
            instance
        });
        expect((await run(instance, 'reports')).headers.get('X-Tenant')).toBe('acme');
        expect((await run(instance, 'users')).headers.get('X-Tenant')).toBeUndefined();
    });

    it('reads the value per request, not once at registration', async () => {
        let tenant = 'first';
        createHeaderInterceptor({ header: 'X-Tenant', value: () => tenant, instance });
        expect((await run(instance, 'users')).headers.get('X-Tenant')).toBe('first');
        tenant = 'second';
        expect((await run(instance, 'users')).headers.get('X-Tenant')).toBe('second');
    });

    it.each([[null], [undefined], ['']])('skips the header when the value is %s', async (value) => {
        createHeaderInterceptor({
            header: 'X-Tenant',
            value: () => value as string | null | undefined,
            instance
        });
        expect((await run(instance, 'users')).headers.get('X-Tenant')).toBeUndefined();
    });

    it('matches against the absolute url when one is given', async () => {
        createHeaderInterceptor({
            header: 'X-Tenant',
            value: () => 'acme',
            match: /^https:\/\/other\.example\.com/,
            instance
        });
        expect((await run(instance, 'https://other.example.com/x')).headers.get('X-Tenant')).toBe('acme');
        expect((await run(instance, 'users')).headers.get('X-Tenant')).toBeUndefined();
    });

    it('the returned handle removes the interceptor', async () => {
        const stop = createHeaderInterceptor({ header: 'X-Tenant', value: () => 'acme', instance });
        stop();
        expect((await run(instance, 'users')).headers.get('X-Tenant')).toBeUndefined();
    });
});
