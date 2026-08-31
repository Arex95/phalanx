# Getting started

Phalanx is a foundation, not a UI kit. It ships no components and no styles: it
decides how an admin panel talks to a REST API, how it authenticates, and how
non-CRUD operations are declared. What the screen looks like stays yours.

## Requirements

| Peer dependency | Version | Why |
|---|---|---|
| `vue` | `>=3.0.0` | reactivity and the plugin |
| `axios` | `>=1.6.0` | the default HTTP client and its interceptors |
| `@tanstack/vue-query` | `>=5.0.0` | query and mutation state |
| `jwt-decode` | `^4.0.0` | reading `exp` from the access token |

Node 15 or newer is required to build against it — the source uses
`String.prototype.replaceAll`.

## Install

```bash
pnpm add @arex95/phalanx
pnpm add vue axios @tanstack/vue-query jwt-decode
```

## Register the plugin

```ts
import { createApp } from 'vue';
import { VueQueryPlugin } from '@tanstack/vue-query';
import { Phalanx } from '@arex95/phalanx';
import App from './App.vue';

createApp(App)
    .use(VueQueryPlugin)
    .use(Phalanx, {
        endpoints: {
            login: '/auth/login',
            refresh: '/auth/refresh',
            logout: '/auth/logout'
        },
        tokenPaths: { accessToken: 'data.access_token' },
        refreshTokenPaths: { accessToken: 'data.access_token' },
        axios: {
            baseURL: import.meta.env.VITE_API_URL,
            withCredentials: true
        }
    })
    .mount('#app');
```

`withCredentials: true` is not optional if your API lives on another origin.
Without it the browser will not send the refresh cookie, and it will not tell
you why — the request simply arrives unauthenticated. See
[Backend contract](/concepts/backend-contract).

## Declare a service

```ts
import { RestStd } from '@arex95/phalanx';

export class UserService extends RestStd {
    static resource = 'users';

    static suspend(id: string) {
        return this.customRequest({ method: 'POST', url: `users/${id}/suspend` });
    }
}
```

`resource` is the only required piece. The nine CRUD methods —
`getAll`, `getOne`, `create`, `update`, `patch`, `delete`, `bulkCreate`,
`bulkUpdate`, `bulkDelete`, plus `upsert` and `customRequest` — are inherited.

## Derive the composables

```ts
import { createDomainQueries, createDomainMutations } from '@arex95/phalanx';
import { UserService } from './UserService';

const keys = { all: 'users', one: 'user' };

export const userQueries = createDomainQueries({ service: UserService, keys });
export const userMutations = createDomainMutations({ service: UserService, keys });
```

`suspend` is now available as `userQueries.suspend` and
`userMutations.suspend`, with its argument and return types inferred from the
service method. You did not declare it twice.

## Use them in a view

```vue
<script setup lang="ts">
import { userQueries, userMutations } from '@/domain/users';

const { data, isLoading } = userQueries.getAll();
const { mutate: create } = userMutations.create;
</script>
```

## Next

- [Configuration](/guide/configuration) — every option the plugin takes.
- [Actions](/guide/actions) — permissions, confirmation and invalidation as data.
- [Backend contract](/concepts/backend-contract) — what the API must do for auth to work.
