# Phalanx

**Everything a Vue 3 admin panel needs below the interface.**

Define a resource once and get its service, TanStack queries and mutations, and
its custom operations. Sessions, realtime, encrypted storage and typed errors
come decided. It ships no components.

📖 **[Documentation](https://arex95.github.io/phalanx/)** ·
[Getting started](https://arex95.github.io/phalanx/guide/getting-started) ·
[Server requirements](https://arex95.github.io/phalanx/concepts/server-requirements) ·
[Migrating from vue-core](https://arex95.github.io/phalanx/reference/migration)

```bash
pnpm add @arex95/phalanx
pnpm add vue axios @tanstack/vue-query jwt-decode
```

## Example

```ts
import { RestStd, defineAction, createDomainQueries, createDomainMutations } from '@arex95/phalanx';

class UserService extends RestStd {
    static resource = 'users';

    static suspend = defineAction(
        (id: string) => this.customRequest<User>({
            method: 'POST',
            url: `users/${id}/suspend`
        }),
        { permission: 'users.suspend', requiresConfirmation: true, invalidate: ['users'] }
    );
}

const keys = { all: 'users', one: 'user' };
export const userQueries = createDomainQueries({ service: UserService, keys });
export const userMutations = createDomainMutations({ service: UserService, keys });
```

```vue
<script setup lang="ts">
const { data, isPending } = userQueries.getAll({ params: filters });
const { suspend } = userMutations;
</script>

<template>
  <button :disabled="!suspend.isAuthorized.value" @click="suspend.mutate(id)">
    Suspend
  </button>
</template>
```

`suspend` is a typed mutation that checks the permission, asks for
confirmation, reports the result and invalidates the list.

## What it covers

- **Services.** One class per resource, eleven inherited methods, custom
  operations alongside them.
- **Composables.** TanStack queries and mutations generated from the service,
  including custom methods with their inferred types.
- **Actions.** Permission, confirmation, notification and invalidation declared
  as metadata rather than repeated in each view.
- **Session.** Access token in memory, refresh token in an `HttpOnly` cookie,
  one refresh in flight with concurrent 401s queued behind it.
- **Errors.** `AuthError`, `ValidationError`, `ServerError`, `NetworkError` from
  every call, with validation issues normalised across four common API shapes.
- **Realtime.** A reconnection state machine with backoff, a circuit breaker and
  a token refresh when the stream rejects one. The transport is injected, so it
  runs over SSE, a WebSocket or anything else.
- **Encryption.** Browser storage encrypted under a non-extractable key, and
  hybrid field encryption for data that should only be readable by the server.
- **The small things.** Idempotency keys, contextual headers, a shared signal
  for when the API is unreachable.

It ships no components and no styles: the screen stays yours.

## Requirements

| Peer dependency | Version |
|---|---|
| `vue` | `>=3.0.0` |
| `axios` | `>=1.15.2` |
| `@tanstack/vue-query` | `>=5.0.0` |
| `jwt-decode` | `^4.0.0` |

ESM only. Node 15+ to build against it.

The refresh cookie is set by your API:

```http
Set-Cookie: refresh_token=…; HttpOnly; Secure; SameSite=None; Path=/auth/refresh
```

Full list, including the CORS pair for cross-origin setups:
[Server requirements](https://arex95.github.io/phalanx/concepts/server-requirements).

## Development

```bash
pnpm install
pnpm test         # unit tests
pnpm typecheck
pnpm lint
pnpm build
pnpm -C docs dev  # documentation site
```

`prepublishOnly` runs typecheck, lint, tests and build.

## License

MIT
