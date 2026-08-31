import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, ref } from 'vue';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { createDomainQueries } from './createDomainQueries';
import type { RestStdService } from '@/types';

function withSetup<T>(composable: () => T): { result: T; queryClient: QueryClient; unmount: () => void } {
    let result!: T;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const app = createApp({
        setup() {
            result = composable();
            return () => null;
        }
    });
    app.use(VueQueryPlugin, { queryClient });
    app.mount(document.createElement('div'));
    return { result, queryClient, unmount: () => app.unmount() };
}

async function waitForSuccess(query: { isSuccess: { value: boolean }; isError: { value: boolean }; error: { value: unknown } }) {
    await vi.waitFor(() => {
        if (query.isError.value) throw query.error.value ?? new Error('query errored');
        expect(query.isSuccess.value).toBe(true);
    });
}

interface Entity {
    id: string;
    name: string;
}

function fakeService(overrides: Partial<RestStdService> = {}) {
    return {
        resource: 'widgets',
        getAll: vi.fn(async () => ({
            success: true,
            message: '',
            data: [
                { id: '1', name: 'A' },
                { id: '2', name: 'B' }
            ]
        })),
        getOne: vi.fn(async ({ id }: { id: string }) => ({ success: true, message: '', data: { id, name: 'A' } })),
        create: vi.fn(),
        update: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
        ...overrides
    } as unknown as RestStdService;
}

const keys = {
    list: 'widgets:list',
    item: 'widgets:item',
    selected: 'widgets:selected',
    collection: 'widgets:collection',
    filter: 'widgets:filter'
};

let harness: { result: unknown; queryClient: QueryClient; unmount: () => void } | undefined;

afterEach(() => {
    harness?.unmount();
    harness = undefined;
});

describe('createDomainQueries — getAll', () => {
    it('fetches via service.getAll and returns items/meta/total', async () => {
        const service = fakeService();
        harness = withSetup(() => createDomainQueries({ service, keys }));
        const { result } = harness as unknown as { result: ReturnType<typeof createDomainQueries> };

        const query = result.getAll();
        await waitForSuccess(query);

        expect(query.data.value).toEqual({
            items: [
                { id: '1', name: 'A' },
                { id: '2', name: 'B' }
            ],
            meta: undefined,
            total: 2
        });
    });

    it('extracts items from a Spring Data Page shape ({ content, totalElements })', async () => {
        const service = fakeService({
            getAll: vi.fn(async () => ({
                success: true,
                message: '',
                data: { content: [{ id: '1', name: 'A' }], totalElements: 42 }
            }))
        } as never);
        harness = withSetup(() => createDomainQueries({ service, keys }));
        const { result } = harness as unknown as { result: ReturnType<typeof createDomainQueries> };

        const query = result.getAll();
        await waitForSuccess(query);
        expect(query.data.value?.total).toBe(42);
        expect(query.data.value?.items).toEqual([{ id: '1', name: 'A' }]);
    });

    it('applies the model constructor to each item', async () => {
        class WidgetModel {
            id: string;
            constructor(data: Partial<Entity>) {
                this.id = data.id ?? '';
            }
        }
        const service = fakeService();
        harness = withSetup(() => createDomainQueries({ service, keys, model: WidgetModel }));
        const { result } = harness as unknown as { result: ReturnType<typeof createDomainQueries> };

        const query = result.getAll();
        await waitForSuccess(query);
        expect(query.data.value?.items[0]).toBeInstanceOf(WidgetModel);
    });

    it('converts params through toJsonApi before calling the service', async () => {
        const service = fakeService();
        harness = withSetup(() => createDomainQueries({ service, keys }));
        const { result } = harness as unknown as { result: ReturnType<typeof createDomainQueries> };

        const query = result.getAll({ params: { status: 'active', page: 0 } });
        await waitForSuccess(query);

        expect(service.getAll).toHaveBeenCalledWith({
            params: { 'filter[status]': 'active', 'page[number]': 1, 'page[size]': 15 }
        });
    });

    it('is enabled by default', async () => {
        const service = fakeService();
        harness = withSetup(() => createDomainQueries({ service, keys }));
        const { result } = harness as unknown as { result: ReturnType<typeof createDomainQueries> };
        const query = result.getAll();
        await waitForSuccess(query);
        expect(service.getAll).toHaveBeenCalled();
    });

    it('does not fetch at all when enabled is false', async () => {
        const service = fakeService();
        harness = withSetup(() => createDomainQueries({ service, keys }));
        const { result } = harness as unknown as { result: ReturnType<typeof createDomainQueries> };
        result.getAll({ enabled: false });
        await nextTick();
        expect(service.getAll).not.toHaveBeenCalled();
    });

    it('refetches when a reactive params ref changes', async () => {
        const service = fakeService();
        harness = withSetup(() => createDomainQueries({ service, keys }));
        const { result } = harness as unknown as { result: ReturnType<typeof createDomainQueries> };
        const params = ref<Record<string, unknown>>({ status: 'active' });

        const query = result.getAll({ params });
        await waitForSuccess(query);
        expect(service.getAll).toHaveBeenCalledTimes(1);

        params.value = { status: 'archived' };
        await vi.waitFor(() => expect(service.getAll).toHaveBeenCalledTimes(2));
        expect(service.getAll).toHaveBeenLastCalledWith({ params: { 'filter[status]': 'archived' } });
    });
});

describe('createDomainQueries — getOne', () => {
    it('fetches by id and returns the entity', async () => {
        const service = fakeService();
        harness = withSetup(() => createDomainQueries({ service, keys }));
        const { result } = harness as unknown as { result: ReturnType<typeof createDomainQueries> };

        const query = result.getOne({ id: '5' });
        await waitForSuccess(query);
        expect(service.getOne).toHaveBeenCalledWith({ id: '5', params: undefined });
        expect(query.data.value).toEqual({ id: '5', name: 'A' });
    });

    it('is disabled when id is falsy — never calls the service', async () => {
        const service = fakeService();
        harness = withSetup(() => createDomainQueries({ service, keys }));
        const { result } = harness as unknown as { result: ReturnType<typeof createDomainQueries> };

        result.getOne({ id: null });
        await nextTick();
        expect(service.getOne).not.toHaveBeenCalled();
    });

    it('becomes enabled once a null id ref changes to a real id', async () => {
        const service = fakeService();
        harness = withSetup(() => createDomainQueries({ service, keys }));
        const { result } = harness as unknown as { result: ReturnType<typeof createDomainQueries> };
        const id = ref<string | null>(null);

        result.getOne({ id });
        await nextTick();
        expect(service.getOne).not.toHaveBeenCalled();

        id.value = '9';
        await vi.waitFor(() => expect(service.getOne).toHaveBeenCalledWith({ id: '9', params: undefined }));
    });

    it('returns null when the response has no data', async () => {
        const service = fakeService({ getOne: vi.fn(async () => ({ success: true, message: '', data: undefined })) as never });
        harness = withSetup(() => createDomainQueries({ service, keys }));
        const { result } = harness as unknown as { result: ReturnType<typeof createDomainQueries> };

        const query = result.getOne({ id: '1' });
        await waitForSuccess(query);
        expect(query.data.value).toBeNull();
    });
});

describe('createDomainQueries — custom query proxy', () => {
    it('proxies a custom method through to the service when called', async () => {
        const searchByTag = vi.fn(async (args: { tag: string }) => ({ items: [args.tag] }));
        const service = fakeService({ searchByTag } as never);
        harness = withSetup(() => createDomainQueries({ service, keys }));
        const { result } = harness as unknown as {
            result: ReturnType<typeof createDomainQueries> & {
                searchByTag: (args?: unknown) => { data: { value: unknown }; isSuccess: { value: boolean }; isError: { value: boolean }; error: { value: unknown } };
            };
        };

        const query = result.searchByTag({ tag: 'red' });
        await waitForSuccess(query);
        expect(searchByTag).toHaveBeenCalledWith({ tag: 'red' });
        expect(query.data.value).toEqual({ items: ['red'] });
    });

    it('is auto-enabled only when every arg field is truthy (allTruthy)', async () => {
        const search = vi.fn(async () => 'ok');
        const service = fakeService({ search } as never);
        harness = withSetup(() => createDomainQueries({ service, keys }));
        const { result } = harness as unknown as {
            result: ReturnType<typeof createDomainQueries> & { search: (args?: unknown) => unknown };
        };

        result.search({ term: '' }); // empty string field → disabled
        await nextTick();
        expect(search).not.toHaveBeenCalled();
    });

    it('is enabled with no args at all', async () => {
        const search = vi.fn(async () => 'ok');
        const service = fakeService({ search } as never);
        harness = withSetup(() => createDomainQueries({ service, keys }));
        const { result } = harness as unknown as {
            result: ReturnType<typeof createDomainQueries> & {
                search: (args?: unknown) => { isSuccess: { value: boolean }; isError: { value: boolean }; error: { value: unknown } };
            };
        };

        const query = result.search();
        await waitForSuccess(query);
        expect(search).toHaveBeenCalled();
    });

    it('an explicit `enabled` option overrides the automatic allTruthy check', async () => {
        const search = vi.fn(async () => 'ok');
        const service = fakeService({ search } as never);
        harness = withSetup(() => createDomainQueries({ service, keys }));
        const { result } = harness as unknown as {
            result: ReturnType<typeof createDomainQueries> & {
                search: (args?: unknown, options?: unknown) => { isSuccess: { value: boolean }; isError: { value: boolean }; error: { value: unknown } };
            };
        };

        // Empty string would normally disable it — explicit enabled:true wins.
        const query = result.search({ term: '' }, { enabled: true });
        await waitForSuccess(query);
        expect(search).toHaveBeenCalled();
    });

    it('uses a keys[] override for the query key when one is configured for that method', async () => {
        const search = vi.fn(async () => 'ok');
        const service = fakeService({ search } as never);
        harness = withSetup(() =>
            createDomainQueries({ service, keys: { ...keys, search: 'custom:search:key' } })
        );
        const { result, queryClient } = harness;
        const query = (result as unknown as { search: (args?: unknown) => { isSuccess: { value: boolean }; isError: { value: boolean }; error: { value: unknown } } }).search({ term: 'x' });
        await waitForSuccess(query);

        const cached = queryClient.getQueryData(['custom:search:key', { term: 'x' }]);
        expect(cached).toBe('ok');
    });

    it('.fetch() performs a one-off fetch through the query client without a reactive subscription', async () => {
        const search = vi.fn(async () => 'fetched-value');
        const service = fakeService({ search } as never);
        harness = withSetup(() => createDomainQueries({ service, keys }));
        const { result } = harness as unknown as {
            result: ReturnType<typeof createDomainQueries> & { search: { fetch: (args?: unknown) => Promise<unknown> } };
        };

        const value = await result.search.fetch({ term: 'x' });
        expect(value).toBe('fetched-value');
    });

    it('returns undefined for a property that does not exist on the service', () => {
        const service = fakeService();
        harness = withSetup(() => createDomainQueries({ service, keys }));
        const { result } = harness as unknown as { result: Record<string, unknown> };
        expect(result.doesNotExist).toBeUndefined();
    });

    it('deeply unrefs reactive args before calling the service (unrefDeep)', async () => {
        const search = vi.fn(async () => 'ok');
        const service = fakeService({ search } as never);
        harness = withSetup(() => createDomainQueries({ service, keys }));
        const { result } = harness as unknown as {
            result: ReturnType<typeof createDomainQueries> & { search: (args?: unknown) => { isSuccess: { value: boolean }; isError: { value: boolean }; error: { value: unknown } } };
        };

        const nested = ref('deep-value');
        const query = result.search({ filters: { nested } });
        await waitForSuccess(query);
        expect(search).toHaveBeenCalledWith({ filters: { nested: 'deep-value' } });
    });
});

describe('createDomainQueries — getAll unrecognised response shape', () => {
    it('returns empty items/zero total for a response shape that is neither an array nor { content }', async () => {
        const service = fakeService({
            getAll: vi.fn(async () => ({ success: true, message: '', data: { somethingElse: true } }))
        } as never);
        harness = withSetup(() => createDomainQueries({ service, keys }));
        const { result } = harness as unknown as { result: ReturnType<typeof createDomainQueries> };

        const query = result.getAll();
        await waitForSuccess(query);
        expect(query.data.value).toEqual({ items: [], meta: undefined, total: 0 });
    });
});
