# Public API

Everything is a named export from `@arex95/phalanx`. There is no default
export.

## Plugin

| Export | |
|---|---|
| `Phalanx` | the Vue plugin — `app.use(Phalanx, options)` |
| `PhalanxOptions` | its options type |

## REST

| Export | |
|---|---|
| `RestStd` | base class for services |
| `AxiosService` | the axios wrapper the default transport is built on |
| `createAxiosFetcher(instance)` | adapts an axios instance to the `Fetcher` contract |
| `getConfiguredAxiosInstance()` | the instance the plugin configured |
| `objectToFormData(obj)` | used internally for multipart writes |
| `toJsonApi(payload)` | JSON:API envelope helper |
| `retryWithBackoff(fn, config)` | the retry primitive services use |

## Composables

| Export | |
|---|---|
| `createDomainQueries(config)` | TanStack queries derived from a service |
| `createDomainMutations(config)` | TanStack mutations derived from a service |
| `useAuth(fetcher?)` | `{ login, logout }` |

## Actions

| Export | |
|---|---|
| `defineAction(fn, meta)` | attaches `ActionMeta` to a service method |
| `withActionBehaviour(...)` | the wrapper the mutations apply; exported for custom layers |
| `ActionCancelledError` | rejection reason when a confirmation is declined |
| `defaultNotify`, `defaultRequestConfirmation` | bare `window` implementations, for prototyping only |

## Session

| Export | |
|---|---|
| `accessToken` | `ComputedRef<string \| null>` |
| `isAuthenticated` | `ComputedRef<boolean>` — presence, not validity |
| `getAccessToken()` / `setAccessToken(t)` | imperative access |
| `verifyAuth()` | synchronous; decodes `exp` and clears an invalid token |
| `refreshTokens()` | forces a refresh; normally the interceptor calls it |
| `extractAccessToken(response, paths)` | dot-path extraction |

## Configuration

`configEndpoints`, `configTokenPaths`, `configRefreshTokenPaths`, `configCsrf`,
`configEncryption`, `configAxios`, `configCallbacks`, `configAuthFetcher`,
`setDefaultAuthFetcherFactory`.

Matching getters: `getEndpointsConfig`, `getTokenPathsConfig`,
`getRefreshTokenPathsConfig`, `getCsrfConfig`, `getEncryptionPublicKeyPem`,
`getCallbacksConfig`, `getDefaultAuthFetcher`.

## Errors

| Export | |
|---|---|
| `BaseError` | the root of the hierarchy; carries `context` |
| `NetworkError`, `AuthError`, `ValidationError`, `ServerError` | typed subclasses |
| `normalizeHttpError(error)` | turns any transport error into one of the above |

`context` preserves the response body, the status and the **response headers** —
so error codes carried in a header survive normalisation.

## Crypto

| Export | |
|---|---|
| `encryptField(value)` | hybrid AES-GCM + RSA-OAEP envelope |
| `encrypt`, `decrypt` | symmetric helpers |
| `importKey`, `getWebCrypto`, `ab2hex`, `hex2ab` | Web Crypto plumbing |
| `storeEncryptedItem`, `getDecryptedItem` | encrypted storage helpers |

::: warning
`storeEncryptedItem` and `getDecryptedItem` are **not** for session tokens. A
key the browser can use is a key an attacker in the page can use. See
[The auth model](/concepts/auth-model).
:::

## Utilities

`isServer`, `isClient`, `getStorage`, `getSessionStorage`, `getCookieStorage`,
`getPreferredStorage`, `safeGet`, `identityTranslate`, `ContentTypeEnum`.

## Types

`PhalanxOptions`, `ActionMeta`, `ActionInjection`, `ConfirmationRequest`,
`NotifyRequest`, `Fetcher`, `FetcherConfig`, `RestStdService`,
`EncryptedField`, `EncryptionConfig`, `CsrfConfig`, `RetryConfig`,
`BaseModelKeys`, `CrudMethodName`, `CrudActions`, `InvalidateEntry`.
