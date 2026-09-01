# Queries

`createDomainQueries` turns a service into TanStack Query composables.

```ts
import { createDomainQueries } from '@arex95/phalanx';

export const userQueries = createDomainQueries({
    service: UserService,
    keys: { all: 'users', one: 'user' }
});
```

| Option | |
|---|---|
| `service` | a class extending `RestStd` |
| `keys` | `{ all, one }` — the cache keys |
| `module` | optional namespace prefixed to every key |
| `model` | optional constructor to hydrate rows into |

Returns `getAll`, `getOne`, `keys`, and one query per custom service method.

## `getAll`

```ts
const { data, isPending, error, refetch } = userQueries.getAll({
    params: filters,      // a ref refetches on change
    enabled: canRead,
    staleTime: 30_000
});
```

Resolves to `{ items, meta, total }`. `meta` carries whatever the API returned
alongside the rows.

```ts
interface GetAllQueryOptions {
    params?: MaybeRef<Record<string, unknown>>;
    enabled?: MaybeRef<boolean>;
    staleTime?: number;
    refetchInterval?: MaybeRef<number | false>;
    refetchOnWindowFocus?: boolean;
}
```

## `getOne`

```ts
const route = useRoute();
const { data: user } = userQueries.getOne({ id: () => route.params.id });
```

The query is disabled while `id` is `null` or `undefined`, so it can be bound
straight to a route parameter. Resolves to the entity or `null`.

## Custom queries

Every custom service method is available with its own return type:

```ts
const { data } = userQueries.exportCsv({ from, to });
```

Each also exposes `fetch` for imperative use outside a component's setup:

```ts
const blob = await userQueries.exportCsv.fetch({ from, to });
```

## Cache keys

`keys` is returned so you can invalidate by hand where the automatic
invalidation does not apply:

```ts
import { useQueryClient } from '@tanstack/vue-query';

const qc = useQueryClient();
qc.invalidateQueries({ queryKey: [userQueries.keys.all] });
```

`module` namespaces them when two modules expose the same resource:

```ts
createDomainQueries({ service: UserService, keys, module: 'admin' });
```

## Hydrating rows

```ts
class User {
    constructor(dto: UserDTO) { Object.assign(this, dto); }
    get displayName() { return `${this.firstName} ${this.lastName}`; }
}

const userQueries = createDomainQueries({ service: UserService, keys, model: User });
```

`getAll` then resolves to `User[]` and `getOne` to `User | null`. Without
`model`, rows are returned as received.
