import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from 'vue';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { createDomainMutations } from './createDomainMutations';
import { defineAction } from '@/actions';
import type { NotifyRequest } from '@/actions';
import type { RestStdService } from '@/types';

/**
 * What a consumer's `notify` can see when a mutation settles.
 *
 * Written first as a record of the defect — `notify` received no reference to
 * the rejection, so a panel had to keep its own `onError` on every call site to
 * show what the server said, and then received two notifications for one
 * failure. These assertions now pin the contract that replaced it.
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
    it('CRUD: the request carries the rejection', async () => {
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

        const mutations = h.result as unknown as { create: { mutateAsync: (v: unknown) => Promise<unknown> } };
        await expect(mutations.create.mutateAsync({ name: 'x' })).rejects.toThrow();
        await vi.waitFor(() => expect(notify).toHaveBeenCalled());

        const request = notify.mock.calls[0][0] as NotifyRequest;
        expect(request.severity).toBe('error');
        expect(request.message).toBe('translated:widget.create.failed');

        // The declared key is the fallback; the rejection is what lets a
        // handler show the reason the API actually gave.
        expect(request.error).toBeInstanceOf(ApiFailure);
        expect((request.error as ApiFailure).serverMessage).toBe('That slot is already taken');
    });

    it('the declared message stays available as the fallback', async () => {
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

        const mutations = h.result as unknown as { create: { mutateAsync: (v: unknown) => Promise<unknown> } };
        await expect(mutations.create.mutateAsync({ name: 'x' })).rejects.toThrow();
        await vi.waitFor(() => expect(notify).toHaveBeenCalled());

        // What a consumer's handler does with both, in one line.
        const { message, error } = notify.mock.calls[0][0] as NotifyRequest;
        const shown = error instanceof ApiFailure ? error.serverMessage : message;
        expect(shown).toBe('That slot is already taken');
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

        const mutations = h.result as unknown as { suspend: { mutateAsync: (v?: unknown) => Promise<unknown> } };
        await expect(mutations.suspend.mutateAsync(undefined)).rejects.toThrow();
        await vi.waitFor(() => expect(notify).toHaveBeenCalled());

        const request = notify.mock.calls[0][0] as NotifyRequest;
        expect(request.message).toBe('translated:widget.suspend.failed');
        expect((request.error as ApiFailure).serverMessage).toBe('This account cannot be suspended');
    });

    it('on success the request carries what the mutation resolved to', async () => {
        const notify = vi.fn();
        const service = failingService() as unknown as Record<string, unknown>;
        service.create = vi.fn(async () => ({ success: true, message: '', data: { id: '7', name: 'ok' } }));

        const h = withSetup(() =>
            createDomainMutations({
                service: service as unknown as RestStdService,
                keys,
                notify,
                translate: (k) => k,
                actions: { create: { successMessageKey: 'widget.create.ok' } }
            })
        );
        harness = h;

        const mutations = h.result as unknown as { create: { mutateAsync: (v: unknown) => Promise<unknown> } };
        await mutations.create.mutateAsync({ name: 'ok' });
        await vi.waitFor(() => expect(notify).toHaveBeenCalled());

        const request = notify.mock.calls[0][0] as NotifyRequest;
        expect(request.severity).toBe('success');
        expect(request.error).toBeUndefined();
        expect(request.data).toMatchObject({ id: '7' });
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

        // Both handlers see the same rejection. With `notify` able to reach it,
        // a view no longer needs its own handler to show the server's reason —
        // which is what makes removing the duplicate possible.
        expect(viewOnError.mock.calls[0][0]).toBeInstanceOf(ApiFailure);
        expect((notify.mock.calls[0][0] as NotifyRequest).error).toBe(viewOnError.mock.calls[0][0]);
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

/**
 * `notifyOptions` is documented as passed through untouched. A consumer is
 * relying on that for more than a UI option: they carry a domain error-code
 * map in it and unpack it in their own `notify`, because the generic extractor
 * would otherwise drop the specific reason the backend refused. Nothing here
 * pinned that, so a future version could reasonably "tidy" the value — spread
 * it, filter it to known UI keys, merge a default into it — and break them
 * silently. These assertions make untouched mean untouched.
 */
describe('`notifyOptions` reaches `notify` untouched', () => {
    it('arrives as the same object, with non-UI values intact', async () => {
        const notify = vi.fn();
        const errorMap = new Map([['waitlist.cap_reached', 'The waitlist is full']]);
        const notifyOptions = {
            errorMap,
            group: 'waitlist',
            resolve: (code: string) => errorMap.get(code)
        };

        const h = withSetup(() =>
            createDomainMutations({
                service: failingService(),
                keys,
                notify,
                translate: (k) => `translated:${k}`,
                actions: { create: { errorMessageKey: 'widget.create.failed', notifyOptions } }
            })
        );
        harness = h;

        const mutations = h.result as unknown as {
            create: { mutateAsync: (v: unknown) => Promise<unknown> };
        };
        await expect(mutations.create.mutateAsync({ name: 'x' })).rejects.toThrow();
        await vi.waitFor(() => expect(notify).toHaveBeenCalled());

        const request = notify.mock.calls[0][0] as NotifyRequest;

        // Identity, not equality: no copy, no spread, no filtering.
        expect(request.extra).toBe(notifyOptions);

        // Values a notification library would never understand survive, which
        // is the whole point of the escape hatch.
        const extra = request.extra as typeof notifyOptions;
        expect(extra.errorMap).toBe(errorMap);
        expect(extra.resolve('waitlist.cap_reached')).toBe('The waitlist is full');
    });

    it('is absent, not an empty object, when nothing was declared', async () => {
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

        const mutations = h.result as unknown as {
            create: { mutateAsync: (v: unknown) => Promise<unknown> };
        };
        await expect(mutations.create.mutateAsync({ name: 'x' })).rejects.toThrow();
        await vi.waitFor(() => expect(notify).toHaveBeenCalled());

        expect((notify.mock.calls[0][0] as NotifyRequest).extra).toBeUndefined();
    });
});
