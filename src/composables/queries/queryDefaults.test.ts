import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from 'vue';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { createDomainQueries } from './createDomainQueries';
import type { RestStdService } from '@/types';

/**
 * Cache policy declared once at the domain, and what still belongs to the call.
 */
function withSetup<T>(composable: () => T) {
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

const keys = {
    list: 'w:list', item: 'w:item', selected: 'w:selected',
    collection: 'w:collection', filter: 'w:filter'
};

function service() {
    return {
        resource: 'widgets',
        getAll: vi.fn(async () => ({ data: [], meta: {}, total: 0 })),
        getOne: vi.fn(async () => ({ data: { id: '1' } })),
        exportCsv: vi.fn(async () => 'csv')
    } as unknown as RestStdService;
}

/** What TanStack ended up with, which is the only thing that matters. */
function staleTimeOf(queryClient: QueryClient, key: unknown[]) {
    const match = queryClient
        .getQueryCache()
        .getAll()
        .find((q) => JSON.stringify(q.queryKey).startsWith(JSON.stringify(key).slice(0, -1)));
    return (match?.options as { staleTime?: number } | undefined)?.staleTime;
}

let harness: { unmount: () => void } | undefined;
afterEach(() => {
    harness?.unmount();
    harness = undefined;
});

describe('defaultOptions', () => {
    it('applies to getAll when the call site says nothing', () => {
        const h = withSetup(() => {
            const q = createDomainQueries({
                service: service(),
                keys,
                defaultOptions: { getAll: { staleTime: 30_000 } }
            });
            q.getAll();
            return q;
        });
        harness = h;
        expect(staleTimeOf(h.queryClient, [keys.list])).toBe(30_000);
    });

    it('the call site wins', () => {
        const h = withSetup(() => {
            const q = createDomainQueries({
                service: service(),
                keys,
                defaultOptions: { getAll: { staleTime: 30_000 } }
            });
            q.getAll({ staleTime: 1_000 });
            return q;
        });
        harness = h;
        expect(staleTimeOf(h.queryClient, [keys.list])).toBe(1_000);
    });

    it('is per query — getOne does not inherit getAll', () => {
        const h = withSetup(() => {
            const q = createDomainQueries({
                service: service(),
                keys,
                defaultOptions: { getAll: { staleTime: 30_000 }, getOne: { staleTime: 0 } }
            });
            q.getAll();
            q.getOne({ id: '1' });
            return q;
        });
        harness = h;
        expect(staleTimeOf(h.queryClient, [keys.list])).toBe(30_000);
        expect(staleTimeOf(h.queryClient, [keys.item])).toBe(0);
    });

    it('reaches a custom method by its name', () => {
        const h = withSetup(() => {
            const q = createDomainQueries({
                service: service(),
                keys,
                defaultOptions: { exportCsv: { staleTime: 60_000 } }
            }) as unknown as Record<string, (a?: unknown) => unknown>;
            q.exportCsv({ from: 'a' });
            return q;
        });
        harness = h;

        const cached = h.queryClient.getQueryCache().getAll();
        const custom = cached.find((q) => JSON.stringify(q.queryKey).includes('exportCsv'));
        expect((custom?.options as { staleTime?: number }).staleTime).toBe(60_000);
    });

    it('a query with no default is left alone', () => {
        const h = withSetup(() => {
            const q = createDomainQueries({
                service: service(),
                keys,
                defaultOptions: { getOne: { staleTime: 5_000 } }
            });
            q.getAll();
            return q;
        });
        harness = h;
        expect(staleTimeOf(h.queryClient, [keys.list])).toBeUndefined();
    });

    it('omitting defaultOptions entirely changes nothing', () => {
        const h = withSetup(() => {
            const q = createDomainQueries({ service: service(), keys });
            q.getAll();
            return q;
        });
        harness = h;
        expect(staleTimeOf(h.queryClient, [keys.list])).toBeUndefined();
    });
});
