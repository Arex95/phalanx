# Migrating from `@arex95/vue-core`

v6 is published as `@arex95/phalanx`. `@arex95/vue-core` stops at 5.1.0.

```bash
pnpm remove @arex95/vue-core
pnpm add @arex95/phalanx @tanstack/vue-query
pnpm remove ofetch uuid   # if they were installed only for the library
```

## Renamed

| v5 | v6 |
|---|---|
| `ArexVueCore` | `Phalanx` |
| `ArexVueCoreOptions` | `PhalanxOptions` |
| `[arex-core]` error prefix | `[phalanx]` |

## Session handling

Tokens are no longer stored by the library. The access token is held in memory
and the refresh token is expected in a cookie set by the server.

| Removed | Replacement |
|---|---|
| `appKey`, `configKey` | — |
| `tokenKeys`, `configTokens`, `storeTokens` | the `accessToken` ref |
| `configSession`, `cleanCredentials` | `logout()` clears the session |
| storage modes `'local'`, `'session'`, `'cookie'` | a server-set cookie |
| `refreshTokenBodyKey` | the refresh request has no body |

```diff
 app.use(Phalanx, {
-  appKey: import.meta.env.VITE_APP_KEY,
   endpoints: { login: '/auth/login', refresh: '/auth/refresh', logout: '/auth/logout' },
-  tokenKeys: { accessToken: 'access_token', refreshToken: 'refresh_token' },
   tokenPaths: { accessToken: 'data.access_token' },
   refreshTokenPaths: { accessToken: 'data.access_token' },
-  refreshTokenBodyKey: 'refresh_token',
-  axios: { baseURL },
+  axios: { baseURL, withCredentials: true },
 });
```

Reading the token:

```diff
-const token = await getDecryptedItem('access_token', 'any');
+import { accessToken } from '@arex95/phalanx';
+const token = accessToken.value;
```

This step needs the API to set the refresh cookie — see
[Server requirements](/concepts/server-requirements).

## Fetchers

`createOfetchFetcher` is removed, and `ofetch` is no longer a peer dependency.
Any non-axios client is an adapter in your project:

```diff
-import { createOfetchFetcher, configAuthFetcher } from '@arex95/vue-core';
-configAuthFetcher(createOfetchFetcher('https://api.example.com'));
+import { configAuthFetcher, type Fetcher } from '@arex95/phalanx';
+import { $fetch } from 'ofetch';
+
+const ofetchFetcher: Fetcher = (config) =>
+    $fetch(config.url, {
+        method: config.method,
+        query: config.params,
+        body: config.data,
+        headers: config.headers
+    });
+
+configAuthFetcher(ofetchFetcher);
```

## Services

`static isFormData` is removed. `FormData`, `Blob` and `ArrayBuffer` bodies are
detected from the value.

```diff
 class DocumentService extends RestStd {
     static resource = 'documents';
-    static isFormData = true;
 }
```

`customRequest` takes a complete `url` and no longer prefixes `resource`.

## New in v6

- [`createDomainQueries`](/guide/queries) and
  [`createDomainMutations`](/guide/mutations) — TanStack composables derived
  from a service
- [`defineAction`](/guide/actions) — permission, confirmation, notification and
  invalidation as metadata
- [`encryptField`](/guide/field-encryption) — hybrid field encryption
- CSRF double-submit on refresh and logout
