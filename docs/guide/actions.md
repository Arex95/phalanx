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
import { createDomainMutations } from '@arex95/phalanx';
import { userKeys } from '../entities/user.keys';

const userMutations = createDomainMutations({
    service: UserService,
    keys: userKeys,

    checkPermission: (permission) => auth.can(permission),
    translate: (key) => i18n.t(key),
    requestConfirmation: (request, onAccept, onReject) =>
        confirm.require({
            message: request.message,
            header: request.header,
            accept: onAccept,
            reject: onReject
        }),
    notify: ({ severity, message, error }) =>
        toast.add({ severity, detail: extractErrorMessage(error, message) })
});
```

::: tip The declared key is the fallback, not the message
`notify` receives the rejection alongside the translated key, so a handler can
prefer what the API said and fall back to the declaration when it said nothing.

Without that, a view had to keep its own `onError` to reach the server's reason
— and since both handlers run, one failure produced two notifications.
:::

```ts
interface NotifyRequest {
    severity: 'success' | 'error';
    message: string;              // the declared key, translated
    extra?: Record<string, unknown>;
    error?: unknown;              // the rejection, on 'error'
    data?: unknown;               // what the mutation resolved to, on 'success'
}

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

### Registering them once

These four are application policy — one permission system, one dialog, one
toast, one i18n — so they can be registered once instead of restated in every
domain:

```ts
import { configActions } from '@arex95/phalanx';

configActions({
    checkPermission: (permission) => auth.can(permission),
    translate: (key) => i18n.global.t(key),
    requestConfirmation: (request, onAccept, onReject) =>
        confirm.require({ ...request, accept: onAccept, reject: onReject }),
    notify: ({ severity, message, error }) =>
        toast.add({ severity, detail: extractErrorMessage(error, message) })
});
```

Resolution is per function: a module that passes its own `requestConfirmation`
overrides that one and still inherits the registered translator and notifier.

::: warning
`configActions` is module-level state, one set per process. That suits a browser
and does not suit SSR request handling.
:::

Any omitted function — not registered and not passed — disables that concern for
every action in the object.
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
    keys: userKeys,
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
