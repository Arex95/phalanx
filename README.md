# Phalanx

**Opinionated REST + Auth foundation for Vue 3 admin panels.**

Declare a resource once. The service, its TanStack queries and mutations, its
permissions, its confirmations and its cache invalidation all derive from that
one declaration.

📖 **[Documentation](https://github.com/Arex95/phalanx/tree/main/docs)** ·
[Why Phalanx](docs/concepts/why-phalanx.md) ·
[Backend contract](docs/concepts/backend-contract.md)

---

## What it does

- **A REST base class.** `RestStd` gives every resource the same eleven
  methods, plus whatever custom operations you declare on it.
- **Auth that does not pretend.** The access token lives in memory and is never
  persisted; the refresh token rides in an `HttpOnly` cookie the library cannot
  read. One refresh in flight, parallel 401s queued behind it.
- **The 20% that is not CRUD.** Permission, confirmation, notification and
  invalidation declared as data next to the operation, instead of rebuilt by
  hand in every view.
- **Typed all the way down.** A service's custom methods appear on its queries
  and mutations with their real argument and return types, inferred.

It ships **no components and no styles**. What the screen looks like stays
yours.

## Install

```bash
pnpm add @arex95/phalanx
pnpm add vue axios @tanstack/vue-query jwt-decode
```

## Use

```ts
import { createApp } from 'vue';
import { VueQueryPlugin } from '@tanstack/vue-query';
import { Phalanx } from '@arex95/phalanx';

createApp(App)
    .use(VueQueryPlugin)
    .use(Phalanx, {
        endpoints: { login: '/auth/login', refresh: '/auth/refresh', logout: '/auth/logout' },
        tokenPaths: { accessToken: 'data.access_token' },
        refreshTokenPaths: { accessToken: 'data.access_token' },
        axios: { baseURL: import.meta.env.VITE_API_URL, withCredentials: true }
    })
    .mount('#app');
```

```ts
import { RestStd, defineAction, createDomainQueries, createDomainMutations } from '@arex95/phalanx';

class UserService extends RestStd {
    static resource = 'users';

    static suspend = defineAction(
        (id: string) => this.customRequest({ method: 'POST', url: `users/${id}/suspend` }),
        { permission: 'users.suspend', requiresConfirmation: true, invalidate: ['users'] }
    );
}

const keys = { all: 'users', one: 'user' };
export const userQueries = createDomainQueries({ service: UserService, keys });
export const userMutations = createDomainMutations({ service: UserService, keys });
```

`suspend` is now a mutation with `isAuthorized`, a confirmation step and its own
invalidation — typed from the service method, not declared twice.

## This needs something from your backend

The refresh cookie can only be set by a server, so half the auth model lives in
your API:

```http
Set-Cookie: refresh_token=…; HttpOnly; Secure; SameSite=None; Path=/auth/refresh
```

The refresh token must **not** also be returned in the JSON body, and
cross-origin setups need `Access-Control-Allow-Credentials: true` with an
explicit origin — `*` is rejected by browsers when credentials are involved,
and it fails silently. The full list is in
[Backend contract](docs/concepts/backend-contract.md).

## Requirements

| Peer dependency | Version |
|---|---|
| `vue` | `>=3.0.0` |
| `axios` | `>=1.6.0` |
| `@tanstack/vue-query` | `>=5.0.0` |
| `jwt-decode` | `^4.0.0` |

Node 15+ to build. ESM only.

## Development

```bash
pnpm install
pnpm test         # 322 tests
pnpm typecheck    # source
pnpm lint
pnpm build
pnpm -C docs dev  # documentation site
```

`prepublishOnly` runs typecheck, lint, tests and build. A failing gate blocks
the publish.

## Migrating from `@arex95/vue-core`

v6 is a breaking rewrite, and the package changed name.

| Removed | Replacement |
|---|---|
| `appKey`, `configKey` | nothing — a key shipped in the bundle protects nothing |
| `tokenKeys`, `configTokens`, `storeTokens` | the token lives in memory; read `accessToken` |
| token storage modes (`local`, `session`, `cookie`) | the refresh token is an `HttpOnly` cookie set by the backend |
| `refreshTokenBodyKey` | the refresh request has no body |
| `createOfetchFetcher` | any function matching the `Fetcher` contract |
| `ArexVueCore`, `ArexVueCoreOptions` | `Phalanx`, `PhalanxOptions` |

Why the old storage design was unsound is written up in
[The auth model](docs/concepts/auth-model.md).

## License

MIT
