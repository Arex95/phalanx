# Getting started

Phalanx provides what sits under an admin panel: services over a REST API and
the TanStack Query composables derived from them, metadata for operations that
are not CRUD, session handling, realtime connections, encrypted browser storage
and typed errors. It ships no components and no styles.

## Installation

```bash
pnpm add @arex95/phalanx
pnpm add vue axios @tanstack/vue-query jwt-decode
```

| Peer dependency | Version | Used for |
|---|---|---|
| `vue` | `>=3.0.0` | reactivity, the plugin |
| `axios` | `>=1.15.2` | the default transport and its interceptors |
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
import { createDomainQueries, createDomainMutations, createModelKeys } from '@arex95/phalanx';
import { UserService } from './UserService';

export const userKeys = createModelKeys('admin:user');

export function useUsers() {
    return {
        queries: createDomainQueries({ service: UserService, keys: userKeys }),
        mutations: createDomainMutations({ service: UserService, keys: userKeys })
    };
}
```

Both objects expose the CRUD operations and every custom method defined on the
service. `suspend` becomes `queries.suspend` and `mutations.suspend`, typed from
the method signature.

::: warning Build the domain inside `setup()`, not at module scope
Both factories call `useQueryClient()`, so they need Vue's injection context. A
module-level `export const userQueries = createDomainQueries(…)` runs at import
time and throws *"vue-query hooks can only be used inside setup() function"*
before your first component renders. Wrapping them in a function — the
`useUsers()` above — is the whole fix; call it from a component's `setup`.

The keys are the exception, and deliberately so: they are plain strings with no
injection context, so they stay a module-level export that anything can import.
:::

## Use them

```vue
<script setup lang="ts">
import { useUsers } from '@/domain/users';

const { queries, mutations } = useUsers();

const { data, isPending, error } = queries.getAll();
const { mutate: createUser } = mutations.create;
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
| [Project structure](/guide/project-structure) | how to lay a panel out, and why |
| [Services](/guide/services) | the `RestStd` surface and custom methods |
| [Queries](/guide/queries) · [Mutations](/guide/mutations) | the generated composables |
| [Actions](/guide/actions) | permissions, confirmation and invalidation |
| [Error handling](/guide/errors) | the typed error hierarchy |
| [Realtime connections](/guide/realtime) | streams that reconnect and refresh |
| [Typing from OpenAPI](/guide/openapi) | services typed from a generated schema |
| [Secure storage](/guide/secure-storage) | encrypted data at rest in the browser |
