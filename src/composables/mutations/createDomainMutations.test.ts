import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { createDomainMutations } from './createDomainMutations';
import { defineAction } from '@/actions';
import type { RestStdService } from '@/types';

// The standard "test a composable" harness: TanStack Query's `useMutation`/
// `useQueryClient` need a live Vue app with the QueryClient provided, plus
// an active effect scope (which a component's `setup()` gives for free) —
// calling `createDomainMutations()` bare, outside any component, throws.
function withSetup<T>(composable: () => T): { result: T; queryClient: QueryClient; unmount: () => void } {
    let result!: T;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const app = createApp({
        setup() {
            result = composable();
            return () => null;
        }
    });
    app.use(VueQueryPlugin, { queryClient });
    const el = document.createElement('div');
    app.mount(el);
    return { result, queryClient, unmount: () => app.unmount() };
}

interface Entity {
    id: string;
    name: string;
}

function fakeService(overrides: Partial<RestStdService> = {}) {
    return {
        resource: 'widgets',
        getAll: vi.fn(),
        getOne: vi.fn(),
        create: vi.fn(async ({ data }: { data: Partial<Entity> }) => ({
            success: true,
            message: '',
            data: { id: 'new-id', ...data }
        })),
        update: vi.fn(async ({ id, data }: { id: string; data: Partial<Entity> }) => ({
            success: true,
            message: '',
            data: { id, ...data }
        })),
        patch: vi.fn(async ({ id, data }: { id: string; data: Partial<Entity> }) => ({
            success: true,
            message: '',
            data: { id, ...data }
        })),
        delete: vi.fn(async () => ({ success: true, message: '', data: undefined })),
        ...overrides
    } as unknown as RestStdService;
}

const keys = { list: 'widgets:list', item: 'widgets:item', selected: 'widgets:selected', collection: 'widgets:collection', filter: 'widgets:filter' };

let harness: { result: unknown; queryClient: QueryClient; unmount: () => void } | undefined;

afterEach(() => {
    harness?.unmount();
    harness = undefined;
});

describe('createDomainMutations — CRUD', () => {
    it('create calls service.create and settles with the entity', async () => {
        const service = fakeService();
        harness = withSetup(() => createDomainMutations({ service, keys }));
        const { result } = harness as unknown as { result: ReturnType<typeof createDomainMutations> };

        await result.create.mutateAsync({ name: 'Widget' });
        await nextTick();

        expect(service.create).toHaveBeenCalledWith({ data: { name: 'Widget' } });
        expect(result.create.data.value).toEqual({ id: 'new-id', name: 'Widget' });
    });

    it('applies the model constructor to the response, when given one', async () => {
        class WidgetModel {
            id: string;
            name: string;
            constructor(data: Partial<Entity>) {
                this.id = data.id ?? '';
                this.name = data.name ?? '';
            }
            get label() {
                return `Widget: ${this.name}`;
            }
        }
        const service = fakeService();
        harness = withSetup(() => createDomainMutations({ service, keys, model: WidgetModel }));
        const { result } = harness as unknown as { result: ReturnType<typeof createDomainMutations> };

        const entity = await result.create.mutateAsync({ name: 'X' });
        expect(entity).toBeInstanceOf(WidgetModel);
        expect((entity as unknown as WidgetModel).label).toBe('Widget: X');
    });

    it('update calls service.update with id and data', async () => {
        const service = fakeService();
        harness = withSetup(() => createDomainMutations({ service, keys }));
        const { result } = harness as unknown as { result: ReturnType<typeof createDomainMutations> };

        await result.update.mutateAsync({ id: '1', data: { name: 'Renamed' } });
        expect(service.update).toHaveBeenCalledWith({ id: '1', data: { name: 'Renamed' } });
    });

    it('patch calls service.patch with id and partial data', async () => {
        const service = fakeService();
        harness = withSetup(() => createDomainMutations({ service, keys }));
        const { result } = harness as unknown as { result: ReturnType<typeof createDomainMutations> };

        await result.patch.mutateAsync({ id: '1', data: { name: 'X' } });
        expect(service.patch).toHaveBeenCalledWith({ id: '1', data: { name: 'X' } });
    });

    it('remove calls service.delete with the id and resolves with the id', async () => {
        const service = fakeService();
        harness = withSetup(() => createDomainMutations({ service, keys }));
        const { result } = harness as unknown as { result: ReturnType<typeof createDomainMutations> };

        const resolved = await result.remove.mutateAsync('7');
        expect(service.delete).toHaveBeenCalledWith({ id: '7' });
        expect(resolved).toBe('7');
    });

    it('invalidates the list and item query keys on success by default', async () => {
        const service = fakeService();
        harness = withSetup(() => createDomainMutations({ service, keys }));
        const { result, queryClient } = harness as unknown as { result: ReturnType<typeof createDomainMutations>; queryClient: QueryClient };
        const spy = vi.spyOn(queryClient, 'invalidateQueries');

        await result.create.mutateAsync({ name: 'X' });
        expect(spy).toHaveBeenCalledWith({ queryKey: [keys.list] });
        expect(spy).toHaveBeenCalledWith({ queryKey: [keys.item] });
    });

    it('invalidates only the keys in `invalidate: { only: [...] }` when configured for that method', async () => {
        const service = fakeService();
        harness = withSetup(() =>
            createDomainMutations({ service, keys, invalidate: { create: { only: ['custom-key'] } } })
        );
        const { result, queryClient } = harness as unknown as { result: ReturnType<typeof createDomainMutations>; queryClient: QueryClient };
        const spy = vi.spyOn(queryClient, 'invalidateQueries');

        await result.create.mutateAsync({ name: 'X' });
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith({ queryKey: ['custom-key'] });
    });

    it('additionally invalidates extraInvalidateKeys alongside the default list/item keys', async () => {
        const service = fakeService();
        harness = withSetup(() => createDomainMutations({ service, keys, extraInvalidateKeys: ['extra-key'] }));
        const { result, queryClient } = harness as unknown as { result: ReturnType<typeof createDomainMutations>; queryClient: QueryClient };
        const spy = vi.spyOn(queryClient, 'invalidateQueries');

        await result.create.mutateAsync({ name: 'X' });
        // `onSuccess` calls `invalidateForMethod` without awaiting it — the
        // mutation itself settles before every one of its internal
        // `invalidateQueries` awaits (list, item, then each extra key) has
        // necessarily run, so this polls instead of assuming a fixed number
        // of ticks is enough.
        await vi.waitFor(() => {
            expect(spy).toHaveBeenCalledWith({ queryKey: ['extra-key'] });
        });
    });
});

describe('createDomainMutations — actions config for CRUD methods', () => {
    it('gates create behind a confirmation dialog when actions.create.requiresConfirmation is set', async () => {
        const service = fakeService();
        const requestConfirmation = vi.fn();
        harness = withSetup(() =>
            createDomainMutations({
                service,
                keys,
                actions: { create: { requiresConfirmation: true } },
                requestConfirmation
            })
        );
        const { result } = harness as unknown as {
            result: ReturnType<typeof createDomainMutations> & {
                create: { mutate: (a: unknown) => void };
            };
        };

        result.create.mutate({ name: 'X' });
        expect(requestConfirmation).toHaveBeenCalledOnce();
        expect(service.create).not.toHaveBeenCalled();
    });

    it('exposes isAuthorized reflecting checkPermission for a configured action', async () => {
        const service = fakeService();
        const checkPermission = vi.fn(() => false);
        harness = withSetup(() =>
            createDomainMutations({
                service,
                keys,
                actions: { create: { permission: 'widgets.create' } },
                checkPermission
            })
        );
        const { result } = harness as unknown as {
            result: ReturnType<typeof createDomainMutations> & {
                create: { isAuthorized: { value: boolean } };
            };
        };

        expect(result.create.isAuthorized.value).toBe(false);
        expect(checkPermission).toHaveBeenCalledWith('widgets.create');
    });

    it('does not gate update when only create has an actions entry', async () => {
        const service = fakeService();
        harness = withSetup(() =>
            createDomainMutations({ service, keys, actions: { create: { requiresConfirmation: true } } })
        );
        const { result } = harness as unknown as { result: ReturnType<typeof createDomainMutations> };

        await result.update.mutateAsync({ id: '1', data: { name: 'x' } });
        expect(service.update).toHaveBeenCalledOnce();
    });

    it('fires the success notification with the translated key when configured', async () => {
        const service = fakeService();
        const notify = vi.fn();
        const translate = vi.fn((k: string) => `t:${k}`);
        harness = withSetup(() =>
            createDomainMutations({
                service,
                keys,
                actions: { create: { successMessageKey: 'widgets.created' } },
                notify,
                translate
            })
        );
        const { result } = harness as unknown as { result: ReturnType<typeof createDomainMutations> };

        await result.create.mutateAsync({ name: 'X' });
        expect(notify).toHaveBeenCalledWith({ severity: 'success', message: 't:widgets.created', extra: undefined });
    });

    it('fires the error notification when the mutation fails', async () => {
        const service = fakeService({ create: vi.fn(async () => { throw new Error('boom'); }) });
        const notify = vi.fn();
        harness = withSetup(() =>
            createDomainMutations({
                service,
                keys,
                actions: { create: { errorMessageKey: 'widgets.createFailed' } },
                notify
            })
        );
        const { result } = harness as unknown as { result: ReturnType<typeof createDomainMutations> };

        await expect(result.create.mutateAsync({ name: 'X' })).rejects.toThrow('boom');
        expect(notify).toHaveBeenCalledWith({ severity: 'error', message: 'widgets.createFailed', extra: undefined });
    });

    it('does not notify at all when no successMessageKey/errorMessageKey is configured', async () => {
        const service = fakeService();
        const notify = vi.fn();
        harness = withSetup(() => createDomainMutations({ service, keys, notify }));
        const { result } = harness as unknown as { result: ReturnType<typeof createDomainMutations> };

        await result.create.mutateAsync({ name: 'X' });
        expect(notify).not.toHaveBeenCalled();
    });
});

describe('createDomainMutations — custom (defineAction) methods proxy', () => {
    it('proxies a plain custom method (no defineAction) through to the service', async () => {
        const confirmAppointment = vi.fn(async (args: { id: string }) => ({ ok: true, id: args.id }));
        const service = fakeService({ confirmAppointment } as never);
        harness = withSetup(() => createDomainMutations({ service, keys }));
        const { result } = harness as unknown as {
            result: ReturnType<typeof createDomainMutations> & {
                confirmAppointment: { mutateAsync: (a: unknown) => Promise<unknown> };
            };
        };

        const value = await result.confirmAppointment.mutateAsync({ id: '5' });
        expect(confirmAppointment).toHaveBeenCalledWith({ id: '5' });
        expect(value).toEqual({ ok: true, id: '5' });
    });

    it('applies defineAction meta (permission/confirmation) to a custom method', async () => {
        function cancelAppointment(this: unknown, args: { id: string }) {
            return Promise.resolve({ cancelled: args.id });
        }
        const tagged = defineAction(cancelAppointment, { requiresConfirmation: true });
        const service = fakeService({ cancelAppointment: tagged } as never);
        const requestConfirmation = vi.fn();
        harness = withSetup(() => createDomainMutations({ service, keys, requestConfirmation }));
        const { result } = harness as unknown as {
            result: ReturnType<typeof createDomainMutations> & {
                cancelAppointment: { mutate: (a: unknown) => void };
            };
        };

        result.cancelAppointment.mutate({ id: '5' });
        expect(requestConfirmation).toHaveBeenCalledOnce();
    });

    it('returns undefined for a property that does not exist on the service at all', () => {
        const service = fakeService();
        harness = withSetup(() => createDomainMutations({ service, keys }));
        const { result } = harness as unknown as { result: Record<string, unknown> };
        expect(result.doesNotExist).toBeUndefined();
    });

    it('caches the mutation object for a custom method across repeated accesses', () => {
        const service = fakeService({ customThing: vi.fn(async () => 'x') } as never);
        harness = withSetup(() => createDomainMutations({ service, keys }));
        const { result } = harness as unknown as { result: Record<string, unknown> };
        expect(result.customThing).toBe(result.customThing);
    });

    it('a custom method call still triggers the default invalidation', async () => {
        const service = fakeService({ customThing: vi.fn(async () => 'x') } as never);
        harness = withSetup(() => createDomainMutations({ service, keys }));
        const { result, queryClient } = harness as unknown as {
            result: { customThing: { mutateAsync: () => Promise<unknown> } };
            queryClient: QueryClient;
        };
        const spy = vi.spyOn(queryClient, 'invalidateQueries');

        await result.customThing.mutateAsync();
        expect(spy).toHaveBeenCalledWith({ queryKey: [keys.list] });
    });
});

describe('createDomainMutations — mutateWithoutConfirmation / mutateAsyncWithoutConfirmation', () => {
    it('mutateWithoutConfirmation bypasses the confirmation dialog', async () => {
        const service = fakeService();
        const requestConfirmation = vi.fn();
        harness = withSetup(() =>
            createDomainMutations({
                service,
                keys,
                actions: { create: { requiresConfirmation: true } },
                requestConfirmation
            })
        );
        const { result } = harness as unknown as {
            result: ReturnType<typeof createDomainMutations> & {
                create: { mutateWithoutConfirmation: (a: unknown) => void };
            };
        };

        result.create.mutateWithoutConfirmation({ name: 'X' });
        await nextTick();
        expect(requestConfirmation).not.toHaveBeenCalled();
        expect(service.create).toHaveBeenCalledOnce();
    });

    it('exists and works even when requiresConfirmation is not set at all', async () => {
        const service = fakeService();
        harness = withSetup(() =>
            createDomainMutations({ service, keys, actions: { create: { permission: 'x' } } })
        );
        const { result } = harness as unknown as {
            result: ReturnType<typeof createDomainMutations> & {
                create: { mutateAsyncWithoutConfirmation: (a: unknown) => Promise<unknown> };
            };
        };

        const value = await result.create.mutateAsyncWithoutConfirmation({ name: 'X' });
        expect(value).toEqual({ id: 'new-id', name: 'X' });
    });
});

beforeEach(() => {
    vi.restoreAllMocks();
});

describe('createDomainMutations — error notifications for update/patch/remove/custom', () => {
    it('notifies on update error', async () => {
        const service = fakeService({ update: vi.fn(async () => { throw new Error('boom'); }) });
        const notify = vi.fn();
        harness = withSetup(() =>
            createDomainMutations({ service, keys, actions: { update: { errorMessageKey: 'x.updateFailed' } }, notify })
        );
        const { result } = harness as unknown as { result: ReturnType<typeof createDomainMutations> };
        await expect(result.update.mutateAsync({ id: '1', data: {} })).rejects.toThrow('boom');
        expect(notify).toHaveBeenCalledWith({ severity: 'error', message: 'x.updateFailed', extra: undefined });
    });

    it('notifies on patch error', async () => {
        const service = fakeService({ patch: vi.fn(async () => { throw new Error('boom'); }) });
        const notify = vi.fn();
        harness = withSetup(() =>
            createDomainMutations({ service, keys, actions: { patch: { errorMessageKey: 'x.patchFailed' } }, notify })
        );
        const { result } = harness as unknown as { result: ReturnType<typeof createDomainMutations> };
        await expect(result.patch.mutateAsync({ id: '1', data: {} })).rejects.toThrow('boom');
        expect(notify).toHaveBeenCalledWith({ severity: 'error', message: 'x.patchFailed', extra: undefined });
    });

    it('notifies on remove error', async () => {
        const service = fakeService({ delete: vi.fn(async () => { throw new Error('boom'); }) });
        const notify = vi.fn();
        harness = withSetup(() =>
            createDomainMutations({ service, keys, actions: { remove: { errorMessageKey: 'x.removeFailed' } }, notify })
        );
        const { result } = harness as unknown as { result: ReturnType<typeof createDomainMutations> };
        await expect(result.remove.mutateAsync('1')).rejects.toThrow('boom');
        expect(notify).toHaveBeenCalledWith({ severity: 'error', message: 'x.removeFailed', extra: undefined });
    });

    it('notifies on a custom (defineAction) method error using its errorMessageKey', async () => {
        function failingAction() {
            return Promise.reject(new Error('boom'));
        }
        const tagged = defineAction(failingAction, { errorMessageKey: 'x.customFailed' });
        const service = fakeService({ customThing: tagged } as never);
        const notify = vi.fn();
        harness = withSetup(() => createDomainMutations({ service, keys, notify }));
        const { result } = harness as unknown as {
            result: { customThing: { mutateAsync: () => Promise<unknown> } };
        };
        await expect(result.customThing.mutateAsync()).rejects.toThrow('boom');
        expect(notify).toHaveBeenCalledWith({ severity: 'error', message: 'x.customFailed', extra: undefined });
    });
});

describe('createDomainMutations — array-form invalidate entry', () => {
    it('invalidates the default list/item keys PLUS every key in the array (unlike the { only } form, which replaces them)', async () => {
        const service = fakeService();
        harness = withSetup(() =>
            createDomainMutations({ service, keys, invalidate: { create: ['extra-array-key'] } })
        );
        const { result, queryClient } = harness as unknown as {
            result: ReturnType<typeof createDomainMutations>;
            queryClient: QueryClient;
        };
        const spy = vi.spyOn(queryClient, 'invalidateQueries');

        await result.create.mutateAsync({ name: 'X' });
        await vi.waitFor(() => {
            expect(spy).toHaveBeenCalledWith({ queryKey: ['extra-array-key'] });
        });
        expect(spy).toHaveBeenCalledWith({ queryKey: [keys.list] });
        expect(spy).toHaveBeenCalledWith({ queryKey: [keys.item] });
    });
});
