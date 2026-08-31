# Actions

CRUD is the easy part of an admin panel. The part that is not CRUD — suspend a
user, approve a request, close a period — carries the same four concerns every
time: is this person allowed, do we ask first, what do we tell them afterwards,
and what does the cache need to forget.

Rebuilt by hand in every view, those four drift. `defineAction` declares them
as data, attached to the operation itself.

## Declaring

```ts
import { RestStd, defineAction } from '@arex95/phalanx';

export class UserService extends RestStd {
    static resource = 'users';

    static suspend = defineAction(
        (id: string) => this.customRequest<User>({
            method: 'POST',
            url: `users/${id}/suspend`
        }),
        {
            permission: 'users.suspend',
            requiresConfirmation: true,
            confirmMessageKey: 'users.suspend.confirm',
            successMessageKey: 'users.suspend.ok',
            errorMessageKey: 'users.suspend.failed',
            invalidate: ['users']
        }
    );
}
```

### `ActionMeta`

| Field | Effect |
|---|---|
| `permission` | checked through `checkPermission`; drives `isAuthorized` |
| `requiresConfirmation` | routes the call through `requestConfirmation` first |
| `confirmMessageKey`, `confirmHeaderKey` | resolved through `translate` |
| `confirmOptions` | passed to the confirmation handler untouched |
| `successMessageKey`, `errorMessageKey` | resolved and sent to `notify` |
| `notifyOptions` | passed to the notify handler untouched |
| `invalidate` | `string[]` to add, or `{ only: [...] }` to replace |

## Wiring the host application

Phalanx does not own your dialog, your toast or your permission system. You
inject four functions, once, where the mutations are created:

```ts
const userMutations = createDomainMutations({
    service: UserService,
    keys: { all: 'users', one: 'user' },

    checkPermission: (p) => auth.can(p),
    translate: (k) => i18n.t(k),
    requestConfirmation: (request, onAccept, onReject) =>
        confirm.require({
            message: request.message,
            header: request.header,
            accept: onAccept,
            reject: onReject
        }),
    notify: ({ severity, message }) => toast.add({ severity, detail: message })
});
```

Leave any of them out and that concern is skipped — no permission check, no
dialog, no toast. Nothing throws. The library ships `defaultNotify` and
`defaultRequestConfirmation` as bare `window` implementations for prototyping;
they are not meant for production.

## Using

```vue
<script setup lang="ts">
const { suspend } = userMutations;
</script>

<template>
  <button :disabled="!suspend.isAuthorized.value" @click="suspend.mutate(id)">
    Suspend
  </button>
</template>
```

`isAuthorized` is a `ComputedRef<boolean>` that only exists on operations that
declared a `permission`. On anything else the property is not in the type at
all — the discrimination is at compile time, not a runtime `undefined`.

## Escape hatches

Sometimes the confirmation has already happened — a bulk screen that asked once
for forty rows should not ask forty times:

```ts
suspend.mutateWithoutConfirmation(id);
await suspend.mutateAsyncWithoutConfirmation(id);
```

Both skip only the dialog. The permission check, the notification and the
invalidation still run.

## When the user declines

- `mutate` returns `void` and does nothing.
- `mutateAsync` rejects with `ActionCancelledError`, so the `await` settles.

```ts
import { ActionCancelledError } from '@arex95/phalanx';

try {
    await suspend.mutateAsync(id);
} catch (e) {
    if (e instanceof ActionCancelledError) return; // the user said no
    throw e;
}
```

## CRUD operations get this too

The same behaviour attaches to `create`, `update`, `patch` and `remove`:

```ts
createDomainMutations({
    service: UserService,
    keys,
    actions: {
        remove: {
            permission: 'users.delete',
            requiresConfirmation: true,
            confirmMessageKey: 'users.delete.confirm'
        }
    }
});
```

Only the methods listed in `actions` gain `isAuthorized` and the
`…WithoutConfirmation` pair. The others do not have them in their type.
