import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from 'vue';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { configActions, getActionsConfig, resetActionsConfig } from '@config/global/actionsConfig';
import { createDomainMutations } from '@/composables/mutations/createDomainMutations';
import type { RestStdService } from '@/types';

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
    list: 'w:list', item: 'w:item', selected: 'w:selected',
    collection: 'w:collection', filter: 'w:filter'
};

function service() {
    return {
        resource: 'widgets',
        getAll: vi.fn(), getOne: vi.fn(), update: vi.fn(), patch: vi.fn(), delete: vi.fn(),
        create: vi.fn(async () => ({ success: true, message: '', data: { id: '1' } }))
    } as unknown as RestStdService;
}

let harness: { unmount: () => void } | undefined;
afterEach(() => {
    harness?.unmount();
    harness = undefined;
    resetActionsConfig();
});

describe('configActions', () => {
    beforeEach(() => resetActionsConfig());

    it('starts empty', () => {
        expect(getActionsConfig()).toEqual({});
    });

    it('stores a copy, so a later mutation of the caller object does not leak in', () => {
        const source = { translate: (k: string) => k };
        configActions(source);
        (source as Record<string, unknown>).translate = () => 'changed';
        expect(getActionsConfig().translate?.('x')).toBe('x');
    });

    it('a domain with no injection of its own uses the registered ones', async () => {
        const notify = vi.fn();
        configActions({ notify, translate: (k) => `global:${k}` });

        const h = withSetup(() =>
            createDomainMutations({
                service: service(), keys,
                actions: { create: { successMessageKey: 'w.created' } }
            })
        );
        harness = h;

        const m = h.result as unknown as { create: { mutateAsync: (v: unknown) => Promise<unknown> } };
        await m.create.mutateAsync({});
        await vi.waitFor(() => expect(notify).toHaveBeenCalled());
        expect(notify.mock.calls[0][0].message).toBe('global:w.created');
    });

    it('a per-call function wins over the registered one', async () => {
        const globalNotify = vi.fn();
        const localNotify = vi.fn();
        configActions({ notify: globalNotify, translate: (k) => `global:${k}` });

        const h = withSetup(() =>
            createDomainMutations({
                service: service(), keys,
                notify: localNotify,
                actions: { create: { successMessageKey: 'w.created' } }
            })
        );
        harness = h;

        const m = h.result as unknown as { create: { mutateAsync: (v: unknown) => Promise<unknown> } };
        await m.create.mutateAsync({});
        await vi.waitFor(() => expect(localNotify).toHaveBeenCalled());
        expect(globalNotify).not.toHaveBeenCalled();

        // …and the ones it did not override still come from the registration.
        expect(localNotify.mock.calls[0][0].message).toBe('global:w.created');
    });

    it('an unregistered function falls back to the library default', async () => {
        const notify = vi.fn();
        configActions({ notify });

        const h = withSetup(() =>
            createDomainMutations({
                service: service(), keys,
                actions: { create: { successMessageKey: 'w.created' } }
            })
        );
        harness = h;

        const m = h.result as unknown as { create: { mutateAsync: (v: unknown) => Promise<unknown> } };
        await m.create.mutateAsync({});
        await vi.waitFor(() => expect(notify).toHaveBeenCalled());

        // `identityTranslate` — the key comes through untouched.
        expect(notify.mock.calls[0][0].message).toBe('w.created');
    });

    it('permission gating reads the registered checkPermission', () => {
        configActions({ checkPermission: (p) => p === 'w.create' });

        const h = withSetup(() =>
            createDomainMutations({
                service: service(), keys,
                actions: { create: { permission: 'w.create' }, remove: { permission: 'w.delete' } }
            })
        );
        harness = h;

        const m = h.result as unknown as {
            create: { isAuthorized: { value: boolean } };
            remove: { isAuthorized: { value: boolean } };
        };
        expect(m.create.isAuthorized.value).toBe(true);
        expect(m.remove.isAuthorized.value).toBe(false);
    });
});
