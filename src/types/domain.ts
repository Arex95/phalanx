/**
 * The shapes `createDomainMutations`/`createDomainQueries`-style factories
 * are built against — generic REST conventions, not this or that backend
 * framework. `ApiResponse` assumes a `{ success, message, data }` envelope
 * because that is a common one, not because it is the only valid one; a
 * backend using a different shape needs its own factory built the same way
 * this one is, not a fork of this file.
 */

export interface ApiResponse<T> {
    success: boolean;
    message: string;
    data: T;
}

export interface BaseModelKeys {
    list: string;
    item: string;
    selected: string;
    collection: string;
    filter: string;
}

export interface ModelConstructor<TEntity, TDTO> {
    new (data: Partial<TDTO>): TEntity;
}

export interface RestStdService {
    resource: string;
    getAll<TResponse = unknown>(options?: { params?: Record<string, unknown> }): Promise<TResponse>;
    getOne<TResponse = unknown>(options: {
        id: string | number;
        params?: Record<string, unknown>;
    }): Promise<TResponse>;
    create<TResponse = unknown, TData = unknown>(options: { data: TData }): Promise<TResponse>;
    update<TResponse = unknown, TData = unknown>(options: {
        id: string | number;
        data: TData;
    }): Promise<TResponse>;
    patch<TResponse = unknown, TData = unknown>(options: {
        id: string | number;
        data: Partial<TData>;
    }): Promise<TResponse>;
    delete<TResponse = unknown>(options: { id: string | number }): Promise<TResponse>;
}

/**
 * The subset of a `RestStdService` subclass's own members that are domain
 * methods eligible for `createDomainMutations`/`createDomainQueries`'s
 * proxy — i.e. not one of the base CRUD methods, and actually callable.
 * Shared here rather than defined once per composable (it used to be
 * duplicated, verbatim, in both `createDomainMutations.ts` and
 * `createDomainQueries.ts` — a single edit to one could have silently
 * drifted from the other).
 *
 * `any` below, deliberately: this filter asks "is this member callable at
 * all", for any real method signature the Service declares. `unknown` would
 * reject every concrete method (contravariant parameter check — see the note
 * on `ActionFn` in `defineAction.ts`), silently dropping every custom method
 * from the exposed type.
 */
export type CustomServiceMethods<TService> = {
    [K in Exclude<
        keyof TService,
        keyof RestStdService | 'prototype'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    > as TService[K] extends (...args: any) => Promise<any>
        ? K
        : never]: TService[K];
};
