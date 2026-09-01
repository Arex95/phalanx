# Actions

An operation that is not CRUD usually carries four concerns beyond the request
itself: whether the user may perform it, whether to confirm first, what to
report afterwards, and what the cache must forget. `defineAction` attaches them
to the service method as metadata.

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

The generated mutation applies them:

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

## `ActionMeta`

| Field | Type | Effect |
|---|---|---|
| `permission` | `string` | passed to `checkPermission`; drives `isAuthorized` |
| `requiresConfirmation` | `boolean` | routes the call through `requestConfirmation` |
| `confirmMessageKey` · `confirmHeaderKey` | `string` | resolved through `translate` |
| `confirmOptions` | `object` | forwarded to the confirmation handler |
| `successMessageKey` · `errorMessageKey` | `string` | resolved and passed to `notify` |
| `notifyOptions` | `object` | forwarded to the notify handler |
| `invalidate` | `string[]` \| `{ only: string[] }` | cache keys to invalidate |

## Wiring the host application

Phalanx does not own the dialog, the toast or the permission system. Provide
four functions where the mutations are created:

```ts
const userMutations = createDomainMutations({
    service: UserService,
    keys: { all: 'users', one: 'user' },

    checkPermission: (permission) => auth.can(permission),
    translate: (key) => i18n.t(key),
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

```ts
interface ActionInjection {
    checkPermission?: (permission: string) => boolean;
    requestConfirmation?: (
        request: ConfirmationRequest,
        onAccept: () => void,
        onReject?: () => void
    ) => void;
    translate?: (key: string) => string;
    notify?: (request: NotifyRequest) => void;
}
```

Any omitted function disables that concern for every action in the object.
`defaultNotify` and `defaultRequestConfirmation` are exported as `window`-based
implementations for prototyping.

## Cancellation

```ts
import { ActionCancelledError } from '@arex95/phalanx';

try {
    await suspend.mutateAsync(id);
} catch (error) {
    if (error instanceof ActionCancelledError) return;
    throw error;
}
```

- `mutate` returns `void` and does nothing when the confirmation is declined.
- `mutateAsync` rejects with `ActionCancelledError`, so the `await` settles.

## Skipping the confirmation

For a screen that has already asked once — a bulk operation over selected rows:

```ts
for (const id of selected.value) {
    await suspend.mutateAsyncWithoutConfirmation(id);
}
```

`mutateWithoutConfirmation` and `mutateAsyncWithoutConfirmation` skip the dialog
only. The permission check, the notification and the invalidation still run.

## CRUD operations

The same metadata applies to `create`, `update`, `patch` and `remove` through
`actions`:

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

`isAuthorized` and the `…WithoutConfirmation` pair exist only on the methods
listed in `actions`. On the others they are absent from the type, so a call site
that assumes them does not compile.
