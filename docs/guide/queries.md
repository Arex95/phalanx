# Queries

`createDomainQueries` turns a service into TanStack Query composables.

```ts
import type { BaseModelKeys } from '@arex95/phalanx';

const userKeys = {
    list: 'admin:user:list',
    item: 'admin:user:item',
    selected: 'admin:user:selected',
    collection: 'admin:user:collection',
    filter: 'admin:user:filter'
} as const satisfies BaseModelKeys;
```

The five keys are required. Namespacing them (`admin:user:`) keeps two modules
that both expose a `list` from colliding, and `as const satisfies BaseModelKeys`
turns a typo into a compile error rather than a cache that silently never
invalidates.

```ts
import { createDomainQueries } from '@arex95/phalanx';

export const userQueries = createDomainQueries({
    service: UserService,
    keys: userKeys
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
const id = computed(() => route.params.id as string);

const { data: user } = userQueries.getOne({ id });
```

`id` takes a value or a `Ref`, so a `computed` binds it to a route parameter.
The query stays disabled while it is `null` or `undefined`, which is what makes
that binding safe on a page that has not resolved its route yet. Resolves to the entity or `null`.

## Custom queries

Every custom service method is available with its own return type:

```ts
const { data } = userQueries.exportCsv({ from, to });
```

Each also exposes `fetch` for imperative use outside a component's setup:

```ts
const blob = await userQueries.exportCsv.fetch({ from, to });
```

## Default options

How fresh a resource must be is a property of the resource, not of the screen
rendering it — the same lookup wants the same freshness on a detail page and in
a label component. Declare it once:

```ts
createDomainQueries({
    service: UserService,
    keys: userKeys,
    defaultOptions: {
        getAll: { staleTime: 30_000 },
        getOne: { staleTime: 0 },
        exportCsv: { staleTime: 60_000 }
    }
});
```

Keyed per query — `getAll`, `getOne`, or a custom method's name — because one
module routinely wants a long stale time on a catalogue and none on the row
being edited. Anything the call site passes wins.

Only `staleTime`, `refetchInterval` and `refetchOnWindowFocus` can be defaulted.
`enabled`, `params` and `id` cannot: `enabled: computed(() => !!uuid.value)`
means something only where it is written.

## Cache keys

`keys` is returned so you can invalidate by hand where the automatic
invalidation does not apply:

```ts
import { useQueryClient } from '@tanstack/vue-query';

const qc = useQueryClient();
qc.invalidateQueries({ queryKey: [userQueries.keys.list] });
```

`module` namespaces them when two modules expose the same resource:

```ts
createDomainQueries({ service: UserService, keys: userKeys, module: 'admin' });
```

## Hydrating rows

```ts
class User {
    firstName!: string;
    lastName!: string;

    constructor(dto: UserDTO) { Object.assign(this, dto); }
    get displayName() { return `${this.firstName} ${this.lastName}`; }
}

const userQueries = createDomainQueries({ service: UserService, keys: userKeys, model: User });
```

`getAll` then resolves to `User[]` and `getOne` to `User | null`. Without
`model`, rows are returned as received.
