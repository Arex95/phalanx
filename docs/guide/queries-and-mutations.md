# Queries and mutations

`createDomainQueries` and `createDomainMutations` turn a service into TanStack
Query composables. You declare the service and its cache keys once; the rest is
derived, including every custom method with its real types.

## Queries

```ts
import { createDomainQueries } from '@arex95/phalanx';

export const userQueries = createDomainQueries({
    service: UserService,
    keys: { all: 'users', one: 'user' },
    module: 'admin',      // optional key namespace
    model: User           // optional class to hydrate rows into
});
```

You get:

| | Returns |
|---|---|
| `getAll(options?)` | `UseQueryReturnType<{ items, meta, total }, Error>` |
| `getOne({ id, … })` | `UseQueryReturnType<TEntity \| null, Error>` |
| `keys` | the resolved key set, for manual invalidation |
| every custom service method | a query with the method's own return type |

```ts
const { data, isLoading, error } = userQueries.getAll({
    params: filters,          // a ref works; the query refetches when it changes
    enabled: canRead,
    staleTime: 30_000
});
```

`getOne` is disabled automatically while `id` is `null` or `undefined`, so you
can bind it straight to a route param without guarding.

Custom queries also expose an imperative `fetch`, for when you need the value
outside a component's render cycle:

```ts
const rows = await userQueries.exportCsv.fetch({ from, to });
```

## Mutations

```ts
import { createDomainMutations } from '@arex95/phalanx';

export const userMutations = createDomainMutations({
    service: UserService,
    keys: { all: 'users', one: 'user' },
    invalidate: { create: ['users', 'stats'] }
});
```

You get `create`, `update`, `patch`, `remove`, and every custom service method,
each a standard TanStack mutation.

```ts
const { mutate, mutateAsync, isPending } = userMutations.update;
mutate({ id, data });
```

### Invalidation

After a mutation succeeds, its keys are invalidated. Three levels decide which:

1. `keys.all` and `keys.one` — always, by default.
2. `invalidate: { create: ['users', 'stats'] }` — per method, in the config.
3. `ActionMeta.invalidate` on a `defineAction` — travels with the operation
   itself, and wins.

`{ only: [...] }` replaces the defaults instead of adding to them:

```ts
invalidate: { patch: { only: ['user'] } }   // do not refetch the whole list
```

### `model`

If you pass a `model` constructor, rows are hydrated into it — `getAll` returns
`User[]`, not raw DTOs — and mutations accept `Partial<TDTO>`. Without it,
entities and DTOs are the same shape and nothing is constructed.

## Typing, and what it costs you

`TypedCustomQueries` and `TypedCustomMutations` infer each custom method's
argument and return type from the service. A method declared as
`suspend(id: string): Promise<User>` produces a mutation typed
`UseMutationReturnType<User, Error, string, unknown>`. Renaming the service
method breaks the call sites at compile time, which is the point.

The constraint that buys this: a custom mutation takes **at most one
argument**. A method with two parameters cannot be inferred into a mutation
signature and is skipped. Pass an object.
