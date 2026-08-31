import { describe, expect, it, vi } from 'vitest';
import { RestStd } from './RestStd';
import { AuthError } from '@/errors';
import type { Fetcher, FetcherConfig } from '@/types';

function makeService(resource: string, fetcher: Fetcher) {
    class Service extends RestStd {
        static override resource = resource;
        static override fetchFn = fetcher;
    }
    return Service;
}

function capturingFetcher(response: unknown = {}) {
    const calls: FetcherConfig[] = [];
    const fetcher: Fetcher = async (config) => {
        calls.push(config);
        return response;
    };
    return { fetcher, calls };
}

describe('RestStd.validateResource', () => {
    it('throws a clear error when resource is never set', async () => {
        class NoResource extends RestStd {}
        await expect(NoResource.getAll()).rejects.toThrow(/Static property 'resource' is required/);
    });

    it('throws when resource is set to an empty/whitespace string', async () => {
        class BlankResource extends RestStd {
            static override resource = '   ';
        }
        await expect(BlankResource.getAll()).rejects.toThrow(/Static property 'resource' is required/);
    });

    it('includes the concrete subclass name in the error message', async () => {
        class Widgets extends RestStd {}
        await expect(Widgets.getAll()).rejects.toThrow(/\[Widgets\]/);
    });
});

describe('RestStd.getAll', () => {
    it('requests the resource URL by default', async () => {
        const { fetcher, calls } = capturingFetcher();
        await makeService('widgets', fetcher).getAll();
        expect(calls[0]).toMatchObject({ method: 'GET', url: 'widgets' });
    });

    it('uses a url override instead of the resource', async () => {
        const { fetcher, calls } = capturingFetcher();
        await makeService('widgets', fetcher).getAll({ url: 'custom/widgets' });
        expect(calls[0]?.url).toBe('custom/widgets');
    });

    it('forwards params', async () => {
        const { fetcher, calls } = capturingFetcher();
        await makeService('widgets', fetcher).getAll({ params: { page: 1 } });
        expect(calls[0]?.params).toEqual({ page: 1 });
    });

    it('omits data/uses read headers when no data is provided', async () => {
        const { fetcher, calls } = capturingFetcher();
        await makeService('widgets', fetcher).getAll();
        expect(calls[0]?.data).toBeUndefined();
        expect(calls[0]?.headers).toEqual({});
    });

    it('includes data and a JSON content-type when data is explicitly provided', async () => {
        const { fetcher, calls } = capturingFetcher();
        await makeService('widgets', fetcher).getAll({ data: { search: 'x' } });
        expect(calls[0]?.data).toEqual({ search: 'x' });
        expect(calls[0]?.headers).toEqual({ 'Content-Type': 'application/json;charset=UTF-8' });
    });
});

describe('RestStd.getOne', () => {
    it('builds the URL as resource/id', async () => {
        const { fetcher, calls } = capturingFetcher();
        await makeService('widgets', fetcher).getOne({ id: '5' });
        expect(calls[0]).toMatchObject({ method: 'GET', url: 'widgets/5' });
    });

    it('coerces a numeric id to a string in the URL', async () => {
        const { fetcher, calls } = capturingFetcher();
        await makeService('widgets', fetcher).getOne({ id: 5 });
        expect(calls[0]?.url).toBe('widgets/5');
    });

    it('forwards params and uses read-only headers (no Content-Type)', async () => {
        const { fetcher, calls } = capturingFetcher();
        await makeService('widgets', fetcher).getOne({ id: 1, params: { include: 'x' } });
        expect(calls[0]?.params).toEqual({ include: 'x' });
        expect(calls[0]?.headers).toEqual({});
    });
});

describe('RestStd.create/update/patch/delete', () => {
    it('create POSTs to the resource root with JSON body', async () => {
        const { fetcher, calls } = capturingFetcher();
        await makeService('widgets', fetcher).create({ data: { name: 'x' } });
        expect(calls[0]).toMatchObject({
            method: 'POST',
            url: 'widgets',
            data: { name: 'x' },
            headers: { 'Content-Type': 'application/json;charset=UTF-8' }
        });
    });

    it('update PUTs to resource/id', async () => {
        const { fetcher, calls } = capturingFetcher();
        await makeService('widgets', fetcher).update({ id: 1, data: { name: 'x' } });
        expect(calls[0]).toMatchObject({ method: 'PUT', url: 'widgets/1', data: { name: 'x' } });
    });

    it('patch PATCHes to resource/id with a partial body', async () => {
        const { fetcher, calls } = capturingFetcher();
        await makeService('widgets', fetcher).patch({ id: 1, data: { name: 'x' } });
        expect(calls[0]).toMatchObject({ method: 'PATCH', url: 'widgets/1', data: { name: 'x' } });
    });

    it('delete DELETEs resource/id with read headers, no body', async () => {
        const { fetcher, calls } = capturingFetcher();
        await makeService('widgets', fetcher).delete({ id: 1 });
        expect(calls[0]).toMatchObject({ method: 'DELETE', url: 'widgets/1', headers: {} });
        expect(calls[0]?.data).toBeUndefined();
    });

    it('does not send a Content-Type when the body is FormData (binary)', async () => {
        const { fetcher, calls } = capturingFetcher();
        const form = new FormData();
        form.append('file', new Blob(['x']));
        await makeService('widgets', fetcher).create({ data: form });
        expect(calls[0]?.headers).toEqual({});
        expect(calls[0]?.data).toBe(form);
    });

    it('respects a url override on write methods', async () => {
        const { fetcher, calls } = capturingFetcher();
        await makeService('widgets', fetcher).create({ data: {}, url: 'custom' });
        expect(calls[0]?.url).toBe('custom');
    });
});

describe('RestStd.bulkCreate/bulkUpdate/bulkDelete', () => {
    it('bulkCreate POSTs to resource/bulk', async () => {
        const { fetcher, calls } = capturingFetcher();
        await makeService('widgets', fetcher).bulkCreate({ data: [{ name: 'a' }, { name: 'b' }] });
        expect(calls[0]).toMatchObject({ method: 'POST', url: 'widgets/bulk', data: [{ name: 'a' }, { name: 'b' }] });
    });

    it('bulkUpdate PUTs to resource/bulk', async () => {
        const { fetcher, calls } = capturingFetcher();
        await makeService('widgets', fetcher).bulkUpdate({ data: [{ id: 1 }] });
        expect(calls[0]).toMatchObject({ method: 'PUT', url: 'widgets/bulk' });
    });

    it('bulkDelete DELETEs resource/bulk with { ids } as the body', async () => {
        const { fetcher, calls } = capturingFetcher();
        await makeService('widgets', fetcher).bulkDelete({ ids: [1, 2, 3] });
        expect(calls[0]).toMatchObject({ method: 'DELETE', url: 'widgets/bulk', data: { ids: [1, 2, 3] } });
    });
});

describe('RestStd.upsert', () => {
    it('routes to update when data.id is a non-empty value', async () => {
        const { fetcher, calls } = capturingFetcher();
        await makeService('widgets', fetcher).upsert({ data: { id: 42, name: 'x' } });
        expect(calls[0]).toMatchObject({ method: 'PUT', url: 'widgets/42' });
    });

    it('treats id: 0 as a real id (update), not falsy-missing', async () => {
        const { fetcher, calls } = capturingFetcher();
        await makeService('widgets', fetcher).upsert({ data: { id: 0, name: 'x' } });
        expect(calls[0]).toMatchObject({ method: 'PUT', url: 'widgets/0' });
    });

    it("treats id: '' as a real id (update), not falsy-missing — regression: buildUrl used to drop it silently", async () => {
        const { fetcher, calls } = capturingFetcher();
        await makeService('widgets', fetcher).upsert({ data: { id: '', name: 'x' } });
        expect(calls[0]).toMatchObject({ method: 'PUT', url: 'widgets/' });
    });

    it('routes to create when id is undefined', async () => {
        const { fetcher, calls } = capturingFetcher();
        await makeService('widgets', fetcher).upsert({ data: { name: 'x' } });
        expect(calls[0]).toMatchObject({ method: 'POST', url: 'widgets' });
    });

    it('routes to create when id is explicitly null', async () => {
        const { fetcher, calls } = capturingFetcher();
        await makeService('widgets', fetcher).upsert({ data: { id: null, name: 'x' } });
        expect(calls[0]).toMatchObject({ method: 'POST', url: 'widgets' });
    });
});

describe('RestStd.customRequest', () => {
    it('sends the given method/url/params without touching resource', async () => {
        const { fetcher, calls } = capturingFetcher();
        await makeService('widgets', fetcher).customRequest({ method: 'POST', url: 'widgets/1/confirm', params: { x: 1 } });
        expect(calls[0]).toMatchObject({ method: 'POST', url: 'widgets/1/confirm', params: { x: 1 } });
    });

    it('does not require `resource` to be set at all', async () => {
        const { fetcher, calls } = capturingFetcher();
        class NoResourceService extends RestStd {
            static override fetchFn = fetcher;
        }
        await NoResourceService.customRequest({ method: 'GET', url: '/health' });
        expect(calls[0]?.url).toBe('/health');
    });

    it('uses read headers (no Content-Type) when no data is given', async () => {
        const { fetcher, calls } = capturingFetcher();
        await makeService('widgets', fetcher).customRequest({ method: 'GET', url: 'x' });
        expect(calls[0]?.headers).toEqual({});
        expect(calls[0]?.data).toBeUndefined();
    });

    it('applies the JSON content-type when data is given', async () => {
        const { fetcher, calls } = capturingFetcher();
        await makeService('widgets', fetcher).customRequest({ method: 'POST', url: 'x', data: { a: 1 } });
        expect(calls[0]?.headers).toEqual({ 'Content-Type': 'application/json;charset=UTF-8' });
    });
});

describe('RestStd.setHeaders', () => {
    it('merges new headers into every subsequent request', async () => {
        const { fetcher, calls } = capturingFetcher();
        const Service = makeService('widgets', fetcher);
        Service.setHeaders({ 'X-Tenant': 'abc' });
        await Service.getAll();
        expect(calls[0]?.headers).toEqual({ 'X-Tenant': 'abc' });
    });

    it('accumulates across multiple calls rather than replacing', async () => {
        const { fetcher, calls } = capturingFetcher();
        const Service = makeService('widgets', fetcher);
        Service.setHeaders({ a: '1' });
        Service.setHeaders({ b: '2' });
        await Service.getAll();
        expect(calls[0]?.headers).toEqual({ a: '1', b: '2' });
    });

    it('are included alongside the JSON content-type on a write', async () => {
        const { fetcher, calls } = capturingFetcher();
        const Service = makeService('widgets', fetcher);
        Service.setHeaders({ 'X-Tenant': 'abc' });
        await Service.create({ data: { x: 1 } });
        expect(calls[0]?.headers).toEqual({ 'X-Tenant': 'abc', 'Content-Type': 'application/json;charset=UTF-8' });
    });
});

describe('RestStd error normalization and retry', () => {
    it('normalizes a thrown error to the typed hierarchy', async () => {
        const fetcher: Fetcher = async () => {
            throw { isAxiosError: true, response: { status: 401, data: {} } };
        };
        await expect(makeService('widgets', fetcher).getAll()).rejects.toBeInstanceOf(AuthError);
    });

    it('retries according to retryConfig on a retryable error, then succeeds', async () => {
        let attempts = 0;
        const fetcher: Fetcher = async () => {
            attempts++;
            if (attempts < 3) {
                throw { isAxiosError: true, response: { status: 503, data: {} } };
            }
            return { ok: true };
        };
        class Service extends RestStd {
            static override resource = 'widgets';
            static override fetchFn = fetcher;
            static override retryConfig = { retries: 3, retryDelay: 1 };
        }
        const result = await Service.getAll();
        expect(result).toEqual({ ok: true });
        expect(attempts).toBe(3);
    });

    it('does not retry at all when retryConfig is not set', async () => {
        let attempts = 0;
        const fetcher: Fetcher = async () => {
            attempts++;
            throw { isAxiosError: true, response: { status: 503, data: {} } };
        };
        await expect(makeService('widgets', fetcher).getAll()).rejects.toBeTruthy();
        expect(attempts).toBe(1);
    });
});

describe('RestStd.getFetchFn fallback to the configured axios instance', () => {
    it('uses the configured axios instance when fetchFn is not set on the subclass', async () => {
        const axiosInstanceModule = await import('@/config/axios/axiosInstance');
        const axiosFetcherModule = await import('@/fetchers/axios');
        const fakeInstance = {} as import('axios').AxiosInstance;
        const fakeFetcher: Fetcher = vi.fn(async () => ({ ok: true }));

        const getInstanceSpy = vi
            .spyOn(axiosInstanceModule, 'getConfiguredAxiosInstance')
            .mockReturnValue(fakeInstance);
        const createFetcherSpy = vi
            .spyOn(axiosFetcherModule, 'createAxiosFetcher')
            .mockReturnValue(fakeFetcher);

        class Service extends RestStd {
            static override resource = 'widgets';
        }
        const result = await Service.getAll();

        expect(getInstanceSpy).toHaveBeenCalled();
        expect(createFetcherSpy).toHaveBeenCalledWith(fakeInstance);
        expect(fakeFetcher).toHaveBeenCalled();
        expect(result).toEqual({ ok: true });

        getInstanceSpy.mockRestore();
        createFetcherSpy.mockRestore();
    });
});
