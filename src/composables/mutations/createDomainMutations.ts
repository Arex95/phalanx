import { effectScope, getCurrentScope, type ComputedRef } from 'vue';
import { useMutation, useQueryClient, type UseMutationReturnType } from '@tanstack/vue-query';
import {
    type ActionAugment,
    type ActionInjection,
    type ActionMeta,
    type AnyMutation,
    defaultNotify,
    defaultRequestConfirmation,
    identityTranslate,
    withActionBehaviour
} from '@/actions';
import type {
    ApiResponse,
    BaseModelKeys,
    CustomServiceMethods,
    ModelConstructor,
    RestStdService
} from '@/types';

export type InvalidateEntry = string[] | { only: string[] };

export type CrudMethodName = 'create' | 'update' | 'patch' | 'remove';

export type CrudActions = Partial<Record<CrudMethodName, ActionMeta>>;

/**
 * Mirrors `ActionAugment`, but for CRUD methods, which have no Service
 * method to carry `.meta` on — the only compile-time signal available is
 * whether the caller's own `actions` object literal has a `K` key at all.
 * `TActions` is inferred from that literal (see `createDomainMutations`'s
 * signature), not widened to the `CrudActions` constraint, which is what
 * makes `K extends keyof TActions` discriminate per-method instead of
 * being true for all four unconditionally.
 *
 * The `[T] extends [UseMutationReturnType<...>]` tuple wrapping is load-
 * bearing, not stylistic: `UseMutationReturnType`'s real shape is a union
 * over TanStack's idle/pending/success/error result states, and a naked
 * `T extends UseMutationReturnType<infer R,...>` conditional distributes
 * over that union — inferring `R`/`A` separately per branch and silently
 * producing a union of *some* branches augmented and others not. Found by
 * actually testing this against `useMutation`'s real return type, not by
 * inspection: an explicit-generics call still failed until this was added.
 */
type CrudAugment<TActions extends CrudActions, K extends CrudMethodName, T> = K extends keyof TActions
    ? [T] extends [UseMutationReturnType<infer R, Error, infer A, unknown>]
        ? {
              isAuthorized: ComputedRef<boolean>;
              mutateWithoutConfirmation: UseMutationReturnType<R, Error, A, unknown>['mutate'];
              mutateAsyncWithoutConfirmation: UseMutationReturnType<R, Error, A, unknown>['mutateAsync'];
          }
        : Record<never, never>
    : Record<never, never>;

export interface CreateDomainMutationsConfig<
    TEntity,
    TDTO,
    TService extends RestStdService,
    TActions extends CrudActions = Record<never, never>
> extends ActionInjection {
    service: TService;
    keys: BaseModelKeys;
    module?: string;
    model?: ModelConstructor<TEntity, TDTO>;
    invalidate?: Record<string, InvalidateEntry>;
    /**
     * Enriches a built-in CRUD mutation the same way `defineAction` enriches
     * a custom method — permission, confirmation, notification. Declared
     * here rather than on the Service, because `create`/`update`/`patch`/
     * `remove` are generic: there is no per-service method to hang
     * `defineAction`'s metadata on. Same `ActionMeta` shape either way; see
     * `actionBehaviour.ts` for why there is one mechanism, not two.
     */
    actions?: TActions;
    /** @deprecated use `invalidate` config instead */
    extraInvalidateKeys?: string[];
}

type TypedCustomMutations<TService> = {
    [K in keyof CustomServiceMethods<TService>]: CustomServiceMethods<TService>[K] extends (
        arg: infer A
    ) => Promise<infer R>
        ? UseMutationReturnType<R, Error, A, unknown> &
              ActionAugment<CustomServiceMethods<TService>[K], R, A>
        : CustomServiceMethods<TService>[K] extends () => Promise<infer R>
          ? UseMutationReturnType<R, Error, void, unknown> &
                ActionAugment<CustomServiceMethods<TService>[K], R, void>
          : never;
};

export function createDomainMutations<
    TEntity,
    TDTO = TEntity,
    TService extends RestStdService = RestStdService,
    TActions extends CrudActions = Record<never, never>
>(config: CreateDomainMutationsConfig<TEntity, TDTO, TService, TActions>) {
    const {
        service,
        keys,
        model,
        extraInvalidateKeys = [],
        invalidate: invalidateConfig = {},
        checkPermission = () => true,
        requestConfirmation = defaultRequestConfirmation,
        translate = identityTranslate,
        notify = defaultNotify
    } = config;
    // Widened to the runtime-shape `CrudActions` for indexed access below —
    // `TActions` stays narrow (the caller's literal `actions` object) so
    // `CrudAugment` can discriminate per-method in the return type; a
    // generic type parameter can't be indexed the way a concrete type can.
    const crudActions: CrudActions = config.actions ?? {};
    void (config.module ?? keys.list.split(':')[0]);
    const queryClient = useQueryClient();
    const ownerScope = getCurrentScope() ?? effectScope();
    const injection: Required<ActionInjection> = {
        checkPermission,
        requestConfirmation,
        translate,
        notify
    };

    function toEntity(dto: TDTO | undefined | null): TEntity | null {
        if (!dto) return null;
        if (!model) return dto as unknown as TEntity;
        return new model(dto as Partial<TDTO>);
    }

    /** `metaInvalidate` — `ActionMeta.invalidate`, from `defineAction` or the
     * `actions` config map — wins over the `invalidate` config passed to
     * `createDomainMutations` itself when both are present for the same
     * method; the per-action one is the more specific override. */
    async function invalidateForMethod(method: string, metaInvalidate?: InvalidateEntry) {
        const entry = metaInvalidate ?? invalidateConfig[method];

        if (entry && !Array.isArray(entry)) {
            for (const k of entry.only) {
                await queryClient.invalidateQueries({ queryKey: [k] });
            }
            return;
        }

        await queryClient.invalidateQueries({ queryKey: [keys.list] });
        await queryClient.invalidateQueries({ queryKey: [keys.item] });
        for (const k of extraInvalidateKeys) {
            await queryClient.invalidateQueries({ queryKey: [k] });
        }
        if (Array.isArray(entry)) {
            for (const k of entry) {
                await queryClient.invalidateQueries({ queryKey: [k] });
            }
        }
    }

    /** Fires the declared toast, when the method's meta asks for one — the
     * same rule for CRUD (via the `actions` config) and custom methods
     * (via `defineAction`). Never replaces a view's own `onSuccess`/
     * `onError` passed to `.mutate()`; both run. */
    function notifyForOutcome(meta: ActionMeta | undefined, severity: 'success' | 'error') {
        const key = severity === 'success' ? meta?.successMessageKey : meta?.errorMessageKey;
        if (!key) return;
        notify({ severity, message: translate(key), extra: meta?.notifyOptions });
    }

    /** Applies `withActionBehaviour` when this CRUD method has a declared
     * `ActionMeta` in the `actions` config; the return type reflects that
     * per-method via `CrudAugment<TActions, K, T>` — `create`/`update`/
     * `patch`/`remove` only gain `isAuthorized`/`mutateWithoutConfirmation`/
     * `mutateAsyncWithoutConfirmation` in their type when the caller's own
     * `actions` object literal actually configured that specific method.
     *
     * `any` in the constraint below, deliberately: `UseMutationReturnType`
     * mixes variance across its generics (`data` is covariant, `mutate`'s
     * argument is contravariant), so no single non-`any` choice — including
     * `unknown` — expresses "any concrete instantiation of this type" here.
     * This was found the hard way: the first version of this function
     * without `any` silently widened `create`/`update`'s real return type. */
    function enrichCrud<
        K extends CrudMethodName,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        T extends UseMutationReturnType<any, Error, any, any>
    >(methodName: K, mutation: T): T & CrudAugment<TActions, K, T> {
        const meta = crudActions[methodName];
        if (!meta) return mutation as T & CrudAugment<TActions, K, T>;
        return withActionBehaviour(
            mutation as unknown as AnyMutation,
            meta,
            injection,
            ownerScope
        ) as unknown as T & CrudAugment<TActions, K, T>;
    }

    const create = enrichCrud(
        'create',
        useMutation({
            mutationFn: async (data: Partial<TDTO>) => {
                const response = await service.create<ApiResponse<TDTO>, Partial<TDTO>>({ data });
                return toEntity(response?.data);
            },
            onSuccess: () => {
                invalidateForMethod('create', crudActions.create?.invalidate);
                notifyForOutcome(crudActions.create, 'success');
            },
            onError: () => notifyForOutcome(crudActions.create, 'error')
        })
    );

    const update = enrichCrud(
        'update',
        useMutation({
            mutationFn: async (variables: { id: string; data: Partial<TDTO> }) => {
                const response = await service.update<ApiResponse<TDTO>, Partial<TDTO>>({
                    id: variables.id,
                    data: variables.data
                });
                return toEntity(response?.data);
            },
            onSuccess: () => {
                invalidateForMethod('update', crudActions.update?.invalidate);
                notifyForOutcome(crudActions.update, 'success');
            },
            onError: () => notifyForOutcome(crudActions.update, 'error')
        })
    );

    const patch = enrichCrud(
        'patch',
        useMutation({
            mutationFn: async (variables: { id: string; data: Partial<TDTO> }) => {
                const response = await service.patch<ApiResponse<TDTO>, Partial<TDTO>>({
                    id: variables.id,
                    data: variables.data
                });
                return toEntity(response?.data);
            },
            onSuccess: () => {
                invalidateForMethod('patch', crudActions.patch?.invalidate);
                notifyForOutcome(crudActions.patch, 'success');
            },
            onError: () => notifyForOutcome(crudActions.patch, 'error')
        })
    );

    const remove = enrichCrud(
        'remove',
        useMutation({
            mutationFn: async (id: string) => {
                await service.delete({ id });
                return id;
            },
            onSuccess: () => {
                invalidateForMethod('remove', crudActions.remove?.invalidate);
                notifyForOutcome(crudActions.remove, 'success');
            },
            onError: () => notifyForOutcome(crudActions.remove, 'error')
        })
    );

    const explicit = { create, update, patch, remove, keys } as const;
    const reservedKeys = new Set<string | symbol>(Object.keys(explicit));
    const cache = new Map<string, AnyMutation>();

    const proxy = new Proxy(explicit as Record<string, unknown>, {
        get(target, prop, receiver) {
            if (reservedKeys.has(prop) || typeof prop === 'symbol') {
                return Reflect.get(target, prop, receiver);
            }
            const methodName = prop as string;
            const rawMethod = (service as unknown as Record<string, unknown>)[methodName];
            if (typeof rawMethod !== 'function') {
                return undefined;
            }

            const cached = cache.get(methodName);
            if (cached) return cached;

            const meta = (rawMethod as { meta?: ActionMeta }).meta;
            const serviceMethod = (rawMethod as (a?: unknown) => Promise<unknown>).bind(service);
            const mutation = ownerScope.run(() => useMutation({
                mutationFn: (args: unknown) => serviceMethod(args),
                onSuccess: () => {
                    invalidateForMethod(methodName, meta?.invalidate);
                    notifyForOutcome(meta, 'success');
                },
                onError: () => notifyForOutcome(meta, 'error')
            }, queryClient)) as unknown as AnyMutation;

            const result = meta ? withActionBehaviour(mutation, meta, injection, ownerScope) : mutation;

            cache.set(methodName, result);
            return result;
        }
    });

    return proxy as typeof explicit & TypedCustomMutations<TService>;
}
