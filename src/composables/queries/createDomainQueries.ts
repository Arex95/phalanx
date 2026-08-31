import type {
    ApiResponse,
    BaseModelKeys,
    CustomServiceMethods,
    ModelConstructor,
    RestStdService
} from '@/types';
import { toJsonApi } from './toJsonApi';
import { useQuery, useQueryClient, type UseQueryReturnType } from '@tanstack/vue-query';
import { computed, effectScope, getCurrentScope, isRef, type MaybeRef, unref } from 'vue';

/**
 * A paginated list response's `data` can be a plain array, or a page object
 * exposing its rows under `content` — the shape Spring Data's `Page<T>`
 * serializes to, and one several other backends copy. This is structural,
 * not a named import of that type: this library has no opinion on which
 * backend framework produced the response, only on the two shapes it
 * already knows how to read.
 */
interface FlexibleListResponse<T> {
    data?: T[] | { content: T[] };
    meta?: unknown;
}

function extractList<T>(response: FlexibleListResponse<T> | undefined | null): { items: T[]; meta: unknown; total: number } {
    if (!response) return { items: [], meta: undefined, total: 0 };
    const raw = response.data;
    if (Array.isArray(raw)) {
        const total = extractTotal(response.meta, raw.length);
        return { items: raw, meta: response.meta, total };
    }
    if (raw && typeof raw === 'object' && 'content' in raw && Array.isArray(raw.content)) {
        const total = extractTotal(raw, raw.content.length);
        return { items: raw.content as T[], meta: raw, total };
    }
    return { items: [], meta: response.meta, total: 0 };
}

function extractTotal(meta: unknown, fallback: number): number {
    if (meta && typeof meta === 'object') {
        const m = meta as Record<string, unknown>;
        const candidates = [m.total, m.totalElements];
        for (const c of candidates) {
            if (typeof c === 'number') return c;
        }
    }
    return fallback;
}

function unrefDeep(value: unknown): unknown {
    if (value == null) return value;
    if (isRef(value)) return unrefDeep(value.value);
    if (Array.isArray(value)) return value.map(unrefDeep);
    if (typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(value)) {
            out[k] = unrefDeep((value as Record<string, unknown>)[k]);
        }
        return out;
    }
    return value;
}

function allTruthy(args: unknown): boolean {
    if (args == null) return true;
    const flat = unrefDeep(args);
    if (typeof flat !== 'object' || Array.isArray(flat)) return Boolean(flat);
    for (const k of Object.keys(flat as Record<string, unknown>)) {
        const v = (flat as Record<string, unknown>)[k];
        if (v === null || v === undefined || v === '') return false;
    }
    return true;
}

export interface CreateDomainQueriesConfig<TEntity, TDTO, TService extends RestStdService> {
    service: TService;
    keys: BaseModelKeys & Record<string, string | undefined>;
    module?: string;
    model?: ModelConstructor<TEntity, TDTO>;
}

export interface GetAllQueryOptions {
    params?: MaybeRef<Record<string, unknown>>;
    enabled?: MaybeRef<boolean>;
    staleTime?: number;
    refetchInterval?: MaybeRef<number | false>;
    refetchOnWindowFocus?: boolean;
}

export interface GetOneQueryOptions {
    id: MaybeRef<string | null | undefined>;
    params?: MaybeRef<Record<string, unknown>>;
    enabled?: MaybeRef<boolean>;
    staleTime?: number;
    refetchInterval?: MaybeRef<number | false>;
    refetchOnWindowFocus?: boolean;
}

type AnyArgs = MaybeRef<Record<string, unknown> | undefined>;

export interface CustomQueryOptions {
    enabled?: MaybeRef<boolean>;
    staleTime?: number;
    refetchInterval?: MaybeRef<number | false>;
    refetchOnWindowFocus?: boolean;
}

type CustomQueryCallable = {
    (args?: AnyArgs, options?: CustomQueryOptions): UseQueryReturnType<unknown, Error>;
    fetch: (args?: AnyArgs) => Promise<unknown>;
};

// `any` below, deliberately: this filter asks "is this member callable at
// all", for any real method signature the Service declares. `unknown` would
// reject every concrete method (contravariant parameter check — see the note
// on `ActionFn` in `defineAction.ts`), silently dropping every custom method
// from the exposed type.
type TypedCustomQueries<TService> = {
    [K in keyof CustomServiceMethods<TService>]:
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        CustomServiceMethods<TService>[K] extends (...args: any) => Promise<infer R>
            ? {
                (args?: AnyArgs, options?: CustomQueryOptions): UseQueryReturnType<R, Error>;
                fetch: (args?: AnyArgs) => Promise<R>;
            }
            : never;
};

export function createDomainQueries<
    TEntity,
    TDTO = TEntity,
    TService extends RestStdService = RestStdService
>(
    config: CreateDomainQueriesConfig<TEntity, TDTO, TService>
) {
    const { service, keys, model } = config;
    const queryClient = useQueryClient();
    const ownerScope = getCurrentScope() ?? effectScope();
    void config.module;

    function keyFor(methodName: string, args: unknown) {
        const override = (keys as unknown as Record<string, string | undefined>)[methodName];
        return override
            ? [override, unrefDeep(args)]
            : [keys.list, methodName, unrefDeep(args)];
    }

    function toEntity(dto: TDTO): TEntity {
        if (!model) return dto as unknown as TEntity;
        return new model(dto as Partial<TDTO>);
    }

    // `ownerScope.run(...)` on both — matching the custom-method proxy
    // below. Without it, `getAll`/`getOne` only work when called
    // synchronously during the same component setup pass that created this
    // composable; wrapping in the captured scope lets them work from a
    // deferred or conditional call site too, the same guarantee the proxy
    // already gave custom methods. Inconsistent robustness between the two
    // was found by testing `getAll`/`getOne` the same way as a custom
    // method and watching only one of them work outside setup.
    function getAll(options: GetAllQueryOptions = {}) {
        const queryKey = computed(() => [keys.list, unref(options.params) ?? {}]);
        const enabled = computed(() => unref(options.enabled) ?? true);
        return ownerScope.run(() => useQuery({
            queryKey,
            enabled,
            staleTime: options.staleTime,
            refetchInterval: options.refetchInterval as never,
            refetchOnWindowFocus: options.refetchOnWindowFocus,
            queryFn: async () => {
                const rawParams = unref(options.params) as Record<string, unknown> | undefined;
                const apiParams = toJsonApi(rawParams);
                const response = await service.getAll<FlexibleListResponse<TDTO>>({
                    params: apiParams
                });
                const { items: raw, meta, total } = extractList(response);
                return { items: raw.map(toEntity), meta, total };
            }
        }, queryClient))!;
    }

    function getOne(options: GetOneQueryOptions) {
        const queryKey = computed(() => [
            keys.item,
            unref(options.id) ?? '',
            unref(options.params) ?? {}
        ]);
        const enabled = computed(() => {
            const id = unref(options.id);
            const flag = unref(options.enabled);
            return Boolean(id) && (flag ?? true);
        });
        return ownerScope.run(() => useQuery({
            queryKey,
            enabled,
            staleTime: options.staleTime,
            refetchInterval: options.refetchInterval as never,
            refetchOnWindowFocus: options.refetchOnWindowFocus,
            queryFn: async () => {
                const id = unref(options.id);
                if (!id) throw new Error('id required');
                const response = await service.getOne<ApiResponse<TDTO>>({
                    id,
                    params: unref(options.params) as Record<string, unknown> | undefined
                });
                return response?.data ? toEntity(response.data) : null;
            }
        }, queryClient))!;
    }

    const explicit = { getAll, getOne, keys } as const;
    const reservedKeys = new Set<string | symbol>(Object.keys(explicit));

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
            const serviceMethod = (rawMethod as (a?: unknown) => Promise<unknown>).bind(service);

            const callable: CustomQueryCallable = ((args?: AnyArgs, options?: CustomQueryOptions) => {
                const queryKey = computed(() => keyFor(methodName, args));
                const enabled = options?.enabled !== undefined
                    ? computed(() => Boolean(unref(options.enabled)))
                    : computed(() => allTruthy(args));
                return ownerScope.run(() => useQuery({
                    queryKey,
                    enabled,
                    staleTime: options?.staleTime,
                    refetchInterval: options?.refetchInterval as never,
                    refetchOnWindowFocus: options?.refetchOnWindowFocus,
                    queryFn: () => serviceMethod(unrefDeep(args))
                }, queryClient))!;
            }) as CustomQueryCallable;

            callable.fetch = (args?: AnyArgs) => {
                return queryClient.fetchQuery({
                    queryKey: keyFor(methodName, args),
                    queryFn: () => serviceMethod(unrefDeep(args))
                });
            };

            return callable;
        }
    });

    return proxy as typeof explicit & TypedCustomQueries<TService>;
}
