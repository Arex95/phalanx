# Getting started

Phalanx provides the data layer of an admin panel: services over a REST API,
TanStack Query composables derived from them, session handling, and metadata for
operations that are not CRUD. It ships no components and no styles.

## Installation

```bash
pnpm add @arex95/phalanx
pnpm add vue axios @tanstack/vue-query jwt-decode
```

| Peer dependency | Version | Used for |
|---|---|---|
| `vue` | `>=3.0.0` | reactivity, the plugin |
| `axios` | `>=1.6.0` | the default transport and its interceptors |
| `@tanstack/vue-query` | `>=5.0.0` | query and mutation state |
| `jwt-decode` | `^4.0.0` | reading `exp` from the access token |

ESM only. Node 15 or newer to build against it.

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

`withCredentials: true` lets the browser send the refresh cookie when the API is
on another origin. See [Configuration](/guide/configuration) for the full option
set and [Server requirements](/concepts/server-requirements) for the responses
the API returns.

## Define a service

```ts
import { RestStd } from '@arex95/phalanx';

export class UserService extends RestStd {
    static resource = 'users';

    static suspend(id: string) {
        return this.customRequest<User>({
            method: 'POST',
            url: `users/${id}/suspend`
        });
    }
}
```

`resource` is the only required member. Eleven methods are inherited: `getAll`,
`getOne`, `create`, `update`, `patch`, `delete`, `bulkCreate`, `bulkUpdate`,
`bulkDelete`, `upsert` and `customRequest`.

## Derive the composables

```ts
import { createDomainQueries, createDomainMutations } from '@arex95/phalanx';
import { UserService } from './UserService';

const keys = { all: 'users', one: 'user' };

export const userQueries = createDomainQueries({ service: UserService, keys });
export const userMutations = createDomainMutations({ service: UserService, keys });
```

Both objects expose the CRUD operations and every custom method defined on the
service. `suspend` becomes `userQueries.suspend` and `userMutations.suspend`,
typed from the method signature.

## Use them

```vue
<script setup lang="ts">
import { userQueries, userMutations } from '@/domain/users';

const { data, isPending, error } = userQueries.getAll();
const { mutate: createUser } = userMutations.create;
</script>

<template>
  <p v-if="isPending">Loading…</p>
  <p v-else-if="error">{{ error.message }}</p>
  <ul v-else>
    <li v-for="user in data.items" :key="user.id">{{ user.name }}</li>
  </ul>
</template>
```

`getAll` resolves to `{ items, meta, total }`.

## Next steps

| | |
|---|---|
| [Services](/guide/services) | the `RestStd` surface and custom methods |
| [Queries](/guide/queries) · [Mutations](/guide/mutations) | the generated composables |
| [Actions](/guide/actions) | permissions, confirmation and invalidation |
| [Error handling](/guide/errors) | the typed error hierarchy |
