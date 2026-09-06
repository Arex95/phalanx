import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from 'vue';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { createDomainMutations } from './createDomainMutations';
import { defineAction } from '@/actions';
import type { NotifyRequest } from '@/actions';
import type { RestStdService } from '@/types';

/**
 * What a consumer's `notify` can actually see when a mutation fails, and
 * whether a view keeping its own `onError` produces a second toast.
 *
 * Written before changing anything: the consuming panel reported both as a
 * reading of the source, and a reading is not an observation.
 */
function withSetup<T>(composable: () => T) {
    let result!: T;
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
    });
    const app = createApp({
        setup() {
            result = composable();
            return () => null;
        }
    });
    app.use(VueQueryPlugin, { queryClient });
    app.mount(document.createElement('div'));
    return { result, unmount: () => app.unmount() };
}

const keys = {
    list: 'widgets:list',
    item: 'widgets:item',
    selected: 'widgets:selected',
    collection: 'widgets:collection',
    filter: 'widgets:filter'
};

/** The shape a real API failure arrives in: normalized, message inside. */
class ApiFailure extends Error {
    constructor(public readonly serverMessage: string) {
        super('Request failed with status code 422');
    }
}

function failingService() {
    const service = {
        resource: 'widgets',
        getAll: vi.fn(),
        getOne: vi.fn(),
        create: vi.fn(async () => {
            throw new ApiFailure('That slot is already taken');
        }),
        update: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
        suspend: defineAction(
            async () => {
                throw new ApiFailure('This account cannot be suspended');
            },
            { errorMessageKey: 'widget.suspend.failed', successMessageKey: 'widget.suspend.ok' }
        )
    };
    return service as unknown as RestStdService;
}

let harness: { unmount: () => void } | undefined;
afterEach(() => {
    harness?.unmount();
    harness = undefined;
});

describe('what `notify` receives on failure', () => {
    it('CRUD: the request carries no reference to the error', async () => {
        const notify = vi.fn();
        const h = withSetup(() =>
            createDomainMutations({
                service: failingService(),
                keys,
                notify,
                translate: (k) => `translated:${k}`,
                actions: { create: { errorMessageKey: 'widget.create.failed' } }
            })
        );
        harness = h;

        const mutations = h.result as { create: { mutateAsync: (v: unknown) => Promise<unknown> } };
        await expect(mutations.create.mutateAsync({ name: 'x' })).rejects.toThrow();
        await vi.waitFor(() => expect(notify).toHaveBeenCalled());

        const request = notify.mock.calls[0][0] as NotifyRequest;
        expect(request.severity).toBe('error');
        expect(request.message).toBe('translated:widget.create.failed');

        // The finding, stated as an assertion: nothing in the request reaches
        // the failure, so a consumer cannot show the server's own message.
        const serialised = JSON.stringify(request);
        expect(serialised).not.toContain('That slot is already taken');
        expect(Object.keys(request).some((k) => /error|cause|failure/i.test(k))).toBe(false);
    });

    it('custom action: same, through defineAction', async () => {
        const notify = vi.fn();
        const h = withSetup(() =>
            createDomainMutations({
                service: failingService(),
                keys,
                notify,
                translate: (k) => `translated:${k}`
            })
        );
        harness = h;

        const mutations = h.result as { suspend: { mutateAsync: (v?: unknown) => Promise<unknown> } };
        await expect(mutations.suspend.mutateAsync(undefined)).rejects.toThrow();
        await vi.waitFor(() => expect(notify).toHaveBeenCalled());

        const request = notify.mock.calls[0][0] as NotifyRequest;
        expect(request.message).toBe('translated:widget.suspend.failed');
        expect(JSON.stringify(request)).not.toContain('cannot be suspended');
    });
});

describe('a view keeping its own handler', () => {
    it("the declared toast and the view's handler both fire", async () => {
        const notify = vi.fn();
        const viewOnError = vi.fn();

        const h = withSetup(() =>
            createDomainMutations({
                service: failingService(),
                keys,
                notify,
                translate: (k) => k,
                actions: { create: { errorMessageKey: 'widget.create.failed' } }
            })
        );
        harness = h;

        const mutations = h.result as {
            create: { mutate: (v: unknown, o?: { onError?: (e: unknown) => void }) => void };
        };
        mutations.create.mutate({ name: 'x' }, { onError: viewOnError });

        await vi.waitFor(() => expect(viewOnError).toHaveBeenCalled());
        await vi.waitFor(() => expect(notify).toHaveBeenCalled());

        // Both ran for one failure. A panel that declares `errorMessageKey`
        // and keeps its existing error toast shows two.
        expect(notify).toHaveBeenCalledTimes(1);
        expect(viewOnError).toHaveBeenCalledTimes(1);

        // And the view's handler *does* get the error — which is why the
        // information exists in the system; it just never reaches `notify`.
        expect(viewOnError.mock.calls[0][0]).toBeInstanceOf(ApiFailure);
    });

    it('without a declared key, only the view is notified', async () => {
        const notify = vi.fn();
        const viewOnError = vi.fn();

        const h = withSetup(() =>
            createDomainMutations({ service: failingService(), keys, notify, translate: (k) => k })
        );
        harness = h;

        const mutations = h.result as {
            create: { mutate: (v: unknown, o?: { onError?: (e: unknown) => void }) => void };
        };
        mutations.create.mutate({ name: 'x' }, { onError: viewOnError });

        await vi.waitFor(() => expect(viewOnError).toHaveBeenCalled());
        expect(notify).not.toHaveBeenCalled();
    });
});
