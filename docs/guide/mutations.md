# Mutations

`createDomainMutations` turns a service into TanStack mutations.

```ts
import { createDomainMutations } from '@arex95/phalanx';

export const userMutations = createDomainMutations({
    service: UserService,
    keys: { all: 'users', one: 'user' }
});
```

Returns `create`, `update`, `patch`, `remove`, and one mutation per custom
service method.

```ts
const { mutate, mutateAsync, isPending, error } = userMutations.update;

mutate({ id: '7', data: { name: 'Ada' } });
await mutateAsync({ id: '7', data: { name: 'Ada' } });
```

| Mutation | Variables |
|---|---|
| `create` | `Partial<TDTO>` |
| `update` · `patch` | `{ id, data }` |
| `remove` | `id` |
| custom | the method's own parameter |

## Invalidation

After a mutation succeeds, `keys.all` and `keys.one` are invalidated. Override
per method:

```ts
createDomainMutations({
    service: UserService,
    keys,
    invalidate: {
        create: ['users', 'dashboard-stats'],   // added to the defaults
        patch:  { only: ['user'] }              // replaces them
    }
});
```

`extraInvalidateKeys` adds keys to every mutation in the object.

An operation declared with [`defineAction`](/guide/actions) can carry its own
`invalidate`, which takes precedence over both.

## Custom mutations

```ts
const { mutate: suspend } = userMutations.suspend;
suspend(userId);
```

The variables type is inferred from the service method. A method with no
parameters produces a mutation taking `void`.

::: warning
Only single-parameter methods are picked up; the generated signature cannot
express more. A method taking two parameters is omitted from the object.
:::

## Optimistic updates and callbacks

These are standard TanStack mutations, so the usual options apply at the call
site:

```ts
const qc = useQueryClient();

userMutations.patch.mutate(
    { id, data },
    {
        onSuccess: () => qc.invalidateQueries({ queryKey: ['audit-log'] }),
        onError: (error) => toast.error(error.message)
    }
);
```

Errors arrive as [typed errors](/guide/errors), so `error instanceof
ValidationError` works in `onError`.

## Hydrating results

With a `model` constructor, mutations resolve to an instance and accept
`Partial<TDTO>` as input:

```ts
createDomainMutations({ service: UserService, keys, model: User });
```
