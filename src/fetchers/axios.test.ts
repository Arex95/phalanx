import { describe, expect, it } from 'vitest';
import axios from 'axios';
import { createAxiosFetcher } from './axios';
import { AuthError } from '@/errors';

describe('createAxiosFetcher', () => {
    it('returns response.data, not the full axios response envelope', async () => {
        const instance = axios.create({
            adapter: (async (config: unknown) => ({
                data: { id: 1 },
                status: 200,
                statusText: 'OK',
                headers: {},
                config
            })) as never
        });
        const fetcher = createAxiosFetcher(instance);
        const result = await fetcher({ method: 'GET', url: '/x' });
        expect(result).toEqual({ id: 1 });
    });

    it('forwards method/url/params/data/headers to axios', async () => {
        let received: unknown;
        const instance = axios.create({
            adapter: async (config) => {
                received = config;
                return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
            }
        });
        const fetcher = createAxiosFetcher(instance);
        await fetcher({ method: 'POST', url: '/things', params: { a: 1 }, data: { b: 2 }, headers: { 'X-Custom': 'y' } });

        // axios lowercases `method` and JSON-serializes `data` via its own
        // request transformer chain before the adapter ever sees it — this
        // asserts what the adapter actually receives, not what was passed in.
        expect(received).toMatchObject({
            method: 'post',
            url: '/things',
            params: { a: 1 },
            data: JSON.stringify({ b: 2 }),
            headers: expect.objectContaining({ 'X-Custom': 'y' })
        });
    });

    it('normalizes a thrown error via normalizeHttpError instead of leaking a raw AxiosError', async () => {
        const instance = axios.create({
            adapter: async () => {
                throw { isAxiosError: true, message: 'boom', response: { status: 401, data: {} } };
            }
        });
        const fetcher = createAxiosFetcher(instance);
        await expect(fetcher({ method: 'GET', url: '/x' })).rejects.toBeInstanceOf(AuthError);
    });

    it('propagates a non-HTTP-shaped thrown value unchanged', async () => {
        const instance = axios.create({
            adapter: async () => {
                throw new Error('totally unrelated failure');
            }
        });
        const fetcher = createAxiosFetcher(instance);
        await expect(fetcher({ method: 'GET', url: '/x' })).rejects.toThrow('totally unrelated failure');
    });
});
