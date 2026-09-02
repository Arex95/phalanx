# API reference

Named exports from `@arex95/phalanx`. There is no default export.

## Plugin

```ts
app.use(Phalanx, options: PhalanxOptions)
```

See [Configuration](/guide/configuration).

## Services

```ts
class RestStd {
    static resource: string;
    static headers: Record<string, string>;
    static fetchFn?: Fetcher;
    static retryConfig?: RetryConfig;
    static setHeaders(headers: Record<string, string>): void;

    static getAll<TResponse, TParams, TData>(options?: GetAllOptions): Promise<TResponse>;
    static getOne<TResponse, TParams>(options: GetOneOptions): Promise<TResponse>;
    static create<TResponse, TData>(options: CreateOptions<TData>): Promise<TResponse>;
    static update<TResponse, TData>(options: UpdateOptions<TData>): Promise<TResponse>;
    static patch<TResponse, TData>(options: PatchOptions<TData>): Promise<TResponse>;
    static delete<TResponse>(options: DeleteOptions): Promise<TResponse>;
    static bulkCreate<TResponse, TData>(options: BulkCreateOptions<TData>): Promise<TResponse>;
    static bulkUpdate<TResponse, TData>(options: BulkUpdateOptions<TData>): Promise<TResponse>;
    static bulkDelete<TResponse>(options: BulkDeleteOptions): Promise<TResponse>;
    static upsert<TResponse, TData>(options: UpsertOptions<TData>): Promise<TResponse>;
    static customRequest<TResponse, TParams, TData>(options: CustomRequestOptions): Promise<TResponse>;
}
```

| Also exported | |
|---|---|
| `AxiosService` | the axios wrapper behind the default transport |
| `createAxiosFetcher(instance)` | adapts an axios instance to `Fetcher` |
| `getConfiguredAxiosInstance()` | the instance the plugin configured |
| `objectToFormData(obj, form?, ns?)` | builds `FormData` from a plain object |
| `toJsonApi(payload)` | JSON:API envelope helper |
| `retryWithBackoff(fn, config?)` | the retry primitive |

## Composables

```ts
createDomainQueries({ service, keys, module?, model? })
createDomainMutations({ service, keys, module?, model?, invalidate?, actions?,
                        extraInvalidateKeys?, ...ActionInjection })
useAuth(fetcher?): { login, logout }
```

See [Queries](/guide/queries), [Mutations](/guide/mutations),
[Authentication](/guide/authentication).

## Actions

```ts
defineAction<TFn>(fn: TFn, meta: ActionMeta): TFn & { meta: ActionMeta }
withActionBehaviour(...)          // the wrapper the mutations apply
class ActionCancelledError extends Error
defaultNotify, defaultRequestConfirmation
```

See [Actions](/guide/actions).

## Session

| Export | Signature |
|---|---|
| `accessToken` | `ComputedRef<string \| null>` |
| `isAuthenticated` | `ComputedRef<boolean>` |
| `getAccessToken()` | `() => string \| null` |
| `setAccessToken(token)` | `(token: string \| null) => void` |
| `verifyAuth()` | `() => boolean` |
| `refreshTokens(fetcher?)` | `(fetcher?: Fetcher) => Promise<void>` |
| `extractAccessToken(response, paths)` | dot-path extraction |

## Configuration

```ts
configEndpoints, configTokenPaths, configRefreshResponsePaths, configCsrf,
configEncryption, configAxios, configCallbacks, configAuthFetcher,
setDefaultAuthFetcherFactory

getEndpointsConfig, getTokenPathsConfig, getRefreshResponsePathsConfig,
getCsrfConfig, getEncryptionPublicKeyPem, getCallbacksConfig,
getDefaultAuthFetcher
```

## Errors

```ts
class BaseError extends Error { code: string; statusCode?: number; context?: object }
class NetworkError    extends BaseError
class AuthError       extends BaseError
class ValidationError extends BaseError { issues: ValidationIssue[] }
class ServerError     extends BaseError

normalizeHttpError(error: unknown): unknown

ERROR_CODE_HEADER                                    // 'x-error-code'
getErrorCode(error: unknown, header?: string): string | null
isErrorCode(error: unknown, code: string, header?: string): boolean
```

See [Error handling](/guide/errors).

## Requests

```ts
createHeaderInterceptor({ header, value, match?, exempt?, instance? }): () => void

IDEMPOTENCY_HEADER                                   // 'Idempotency-Key'
generateIdempotencyKey(): string
useIdempotencyKey({ scope, persist? }): { key, ensure, rotate, clear }
```

See [Requests](/guide/requests).

## Realtime

```ts
class RealtimeConnection {
    constructor(options: { open: StreamOpener; backoff?: BackoffConfig; reportHealth?: boolean })
    start(): void
    stop(): void
    retryNow(): void
    readonly status: Readonly<Ref<ConnectionState>>
}

nextConnectionState(state, event, ctx, backoff?, random?): ConnectionTransition
initialConnectionState
computeDelay(attempt, config?, random?): number
shouldGiveUp(attempt, config?): boolean
DEFAULT_BACKOFF
```

## Backend health

```ts
useBackendHealth(): { status, isDown, isRetrying, retry }
onBackendRecovered(handler): () => void
configBackendHealth({ threshold?, windowMs? }): void
reportBackendFailure(now?): void
reportBackendSuccess(): void
retryBackend(): Promise<void>
```

See [Realtime connections](/guide/realtime).

## Crypto

| Export | |
|---|---|
| `encryptField(value)` | `Promise<EncryptedField>` — AES-GCM + RSA-OAEP |
| `encrypt(text, key)` · `decrypt(cipher, key)` | symmetric helpers |
| `importKey`, `getWebCrypto`, `ab2hex`, `hex2ab` | Web Crypto plumbing |
| `storeEncryptedItem`, `getDecryptedItem` | encrypted storage helpers |

::: warning
`storeEncryptedItem` and `getDecryptedItem` are general-purpose helpers, not a
place for session tokens — the key they use is available to any script in the
page. See [Session handling](/concepts/session).
:::

## Utilities

```ts
isServer, isClient
getStorage, getSessionStorage, getCookieStorage, getPreferredStorage
safeGet, identityTranslate, ContentTypeEnum
```

## Types

```
PhalanxOptions · AxiosServiceOptions · Fetcher · FetcherConfig · RestStdService
ActionMeta · ActionInjection · ConfirmationRequest · NotifyRequest
GetAllOptions · GetOneOptions · CreateOptions · UpdateOptions · PatchOptions
DeleteOptions · BulkCreateOptions · BulkUpdateOptions · BulkDeleteOptions
UpsertOptions · CustomRequestOptions
BaseModelKeys · CrudMethodName · CrudActions · InvalidateEntry
EncryptedField · EncryptionConfig · CsrfConfig · RetryConfig · ValidationIssue
ConnectionState · ConnectionEvent · ConnectionEffect · ConnectionContext
ConnectionTransition · BackoffConfig · StreamContext · StreamOpener
BackendStatus · BackendHealth · HeaderInterceptorOptions
UseIdempotencyKeyOptions · UseIdempotencyKeyReturn
CookieOptions · AuthTokenPaths · AuthResponse · EndpointsConfig
```
