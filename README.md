# Phalanx

**REST and auth foundation for Vue 3 admin panels.**

Declare a resource once and get its service, TanStack queries and mutations, and
custom actions — with session handling, typed errors and cache invalidation
already wired.

📖 **[Documentation](https://github.com/Arex95/phalanx/tree/main/docs)** ·
[Why Phalanx](docs/concepts/why-phalanx.md) ·
[Server requirements](docs/concepts/server-requirements.md)

---

## What it does

- **A REST base class.** `RestStd` gives every resource the same eleven
  methods, plus whatever custom operations you declare on it.
- **Session handling.** Access token in memory, refresh token in an `HttpOnly`
  cookie, one refresh in flight with concurrent 401s queued behind it.
- **Beyond CRUD.** Custom operations carry their permission, confirmation,
  notification and cache invalidation as metadata, so a view calls one mutation
  instead of wiring four concerns.
- **Inferred types.** Custom service methods appear on the generated queries and
  mutations with their own argument and return types.

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

## Server side

The refresh cookie is set by your API:

```http
Set-Cookie: refresh_token=…; HttpOnly; Secure; SameSite=None; Path=/auth/refresh
```

Cross-origin setups also need `Access-Control-Allow-Credentials: true` with an
explicit origin. Full list, including the attributes and the symptoms when one
is wrong: [Server requirements](docs/concepts/server-requirements.md).

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
| `appKey`, `configKey` | removed — tokens are no longer stored client-side |
| `tokenKeys`, `configTokens`, `storeTokens` | the token lives in memory; read `accessToken` |
| token storage modes (`local`, `session`, `cookie`) | access token in memory, refresh token in a server-set cookie |
| `refreshTokenBodyKey` | the refresh request has no body |
| `createOfetchFetcher` | any function matching the `Fetcher` contract |
| `ArexVueCore`, `ArexVueCoreOptions` | `Phalanx`, `PhalanxOptions` |

The model is described in [Session handling](docs/concepts/session.md).

## License

MIT
