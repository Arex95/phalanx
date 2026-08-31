# CONTEXT.md — `@arex95/phalanx` — internal reference

> Working reference for this repo. Covers architecture, contracts, module behavior, and usage patterns. Optimized for someone who just cloned the repo and needs to move fast.

---

## Identity

- **Package:** `@arex95/phalanx`
- **Scope:** REST + Auth foundation for Vue 3 apps. Nothing else.
- **Build:** Rollup → `dist/index.mjs` (ESM only). `"sideEffects": false`.
- **Entry:** `src/index.ts`
- **Package manager:** `pnpm`

Anything that duplicated `@vueuse/core`, `date-fns`, `zod`, `lodash`, `@tanstack/vue-query` or belonged to unrelated toolkits (exports, DOM helpers, breakpoints, monitoring, debounces, strings, dates, validations, `handleError`) was removed in the v6 lean rewrite.

---

## Plugin install

```typescript
import { Phalanx } from '@arex95/phalanx';

app.use(Phalanx, {
  appKey: 'aes-secret-here',
  endpoints:         { login: '/api/auth/login', refresh: '/api/auth/refresh', logout: '/api/auth/logout' },
  tokenKeys:         { accessToken: 'access_token', refreshToken: 'refresh_token' },
  tokenPaths:        { accessToken: 'data.access_token', refreshToken: 'data.refresh_token' },
  refreshTokenPaths: { accessToken: 'data.access_token', refreshToken: 'data.refresh_token' },
  refreshTokenBodyKey: 'refresh_token', // or 'refreshToken' for Spring / NestJS
  axios: {
    baseURL: 'https://api.example.com',
    headers: {},
    timeout: 30000,
    withCredentials: false,
    setupAuthInterceptors: true, // false for Nuxt SSR
  },
  onRefreshFailed: () => {},
  onLogout:        () => {},
});
```

`install()` calls, in order:
`configAppKey → configTokenKeys → configEndpoints → configTokenPaths → configRefreshTokenPaths → configRefreshTokenBodyKey → configAxios → configCallbacks`.

---

## Source layout

```
src/
├── index.ts                       Vue plugin + re-exports
├── config/
│   ├── global/                    Frozen singletons: appKey, tokenKeys, endpoints,
│   │                               tokenPaths, refreshTokenPaths, refreshTokenBodyKey,
│   │                               session, callbacks
│   ├── axios/                     AxiosService (with 401 interceptor) + singleton getter
│   └── auth/                      authFetcher factory
├── rest/RestStd.ts                Base CRUD class
├── composables/auth/useAuth.ts    login / logout
├── fetchers/                      createAxiosFetcher, createOfetchFetcher
├── services/                      extractTokens, refreshTokens, storeTokens, credentials
├── errors/                        BaseError → NetworkError | AuthError | ValidationError | ServerError
│                                  + normalize.ts (status → typed class)
├── enums/contentTypesEnums.ts     Only `ContentTypeEnum` survives
├── types/                         Public type surface only
└── utils/                         Encryption, storage, ssr, retry, safeGet, objectToFormData
```

---

## Config singletons

Each module owns a private variable + a `configX()` / `getX()` pair. The variable is set once at install and frozen; subsequent `configX` calls are no-ops.

| Module | Setter | Getter | Notes |
|---|---|---|---|
| `keyConfig` | `configAppKey({ appKey })` | `getAppKey()` | Throws if unset. |
| `tokensConfig` | `configTokenKeys({ accessTokenKey, refreshTokenKey })` | `getTokenConfig()` | Defaults: `access_token` / `refresh_token`. |
| `endpointsConfig` | `configEndpoints({ loginEndpoint, refreshEndpoint, logoutEndpoint })` | `getEndpointsConfig()` | Defaults: `/login`, `/refresh`, `/logout`. |
| `tokenPathsConfig` | `configTokenPaths({ accessTokenPath, refreshTokenPath })` + `configRefreshTokenPaths(…)` | `getTokenPathsConfig()`, `getRefreshTokenPathsConfig()` | Dot-notation for response extraction. |
| `refreshBodyKeyConfig` | `configRefreshTokenBodyKey(key?)` | `getRefreshTokenBodyKey()` | Default `'refresh_token'`. Flat literal key for the refresh request body. |
| `sessionConfig` | `configSession({ sessionId?, persistencePreference? })` | `getSessionId()`, `getSessionPersistence()`, `getSessionConfig()` | UUID persisted in encrypted storage. |
| `callbacksConfig` | `configCallbacks({ onRefreshFailed?, onLogout? })` | `getCallbacksConfig()` | Optional hooks. |
| `axios/axiosInstance` | `configAxios(options)` | `getConfiguredAxiosInstance()` | Creates the `AxiosService` singleton; lazy-inits with defaults if never configured. Also wires `setDefaultAuthFetcherFactory()`. |
| `auth/authFetcher` | `configAuthFetcher(fetcher)` / `setDefaultAuthFetcherFactory(factory)` | `getDefaultAuthFetcher()` | Throws if neither is set. |

---

## `AxiosService` — `config/axios/axiosConfig.ts`

Wraps a shared axios instance with two interceptors.

**Request:** reads the access token from storage (using the session's persistence preference, not hardcoded `'any'`) and adds `Authorization: Bearer <token>`. Attaches a shared `cancelToken`. Increments `activeRequests`.

**Response (401 flow):**
- Skips refresh when the failing call IS the refresh endpoint, or is already a retry, or is not 401.
- If a refresh is already in flight → the failing request is queued.
- Otherwise: marks `_retry`, calls `refreshTokens()`, releases the queue with the new token, retries the original request.
- If the refresh fails → rejects the queue with the refresh error and rejects the original.
- SSR-safe: skips refresh entirely when `window === undefined`.

Public methods: `getActiveRequests()`, `getAxiosInstance()`, `cancelAllRequests()`, `setHeader(key,value)`, `removeHeader(key)`.

`setupAuthInterceptors: false` → constructor skips `initializeInterceptors()`. Verify it's actually honored end-to-end: `configAxios()` / `getConfiguredAxiosInstance()` must forward the flag.

---

## `RestStd` — `src/rest/RestStd.ts`

Base class. Extend it and override `resource`.

```typescript
export class Role extends RestStd {
    static override resource = 'roles';
    // optional: static fetchFn = createAxiosFetcher(customInstance);
    // optional: static headers = { 'X-Tenant': 'acme' };
    // optional: static retryConfig = { retries: 3 };
}
```

**Static properties**

| Prop | Default | Meaning |
|---|---|---|
| `resource` | — | REQUIRED. Base path (`'users'`, `'catalog/products'`). |
| `headers` | `{}` | Merged into every request. |
| `fetchFn` | Axios via config | Custom fetcher (`(FetcherConfig) => Promise<unknown>`). |
| `retryConfig` | `undefined` | Retry-with-backoff over `executeFetch`. |

**Body serialization (auto-detected)**

- `data instanceof FormData` → sent as-is, no `Content-Type` (client emits multipart boundary).
- `data instanceof Blob` / `ArrayBuffer` → sent as-is, no `Content-Type`.
- Anything else non-nullish → `Content-Type: application/json`.

Centralised in `prepareWrite(data)` — a private helper called by `create`, `update`, `patch`, `bulkCreate`, `bulkUpdate`, `bulkDelete`, `customRequest`.

**Methods**

- `getAll(options)` / `getOne({id})` — reads
- `create({data})` / `update({id,data})` / `patch({id,data})` — writes
- `delete({id})` / `bulkDelete({ids})`
- `bulkCreate({data:[…]})` / `bulkUpdate({data:[…]})` → `/{resource}/bulk`
- `upsert({data})` → `update` when `data.id` is defined (including `0`), else `create`.
- `customRequest({method,url,params,data})` — escape hatch, honors `prepareWrite`.

Every method calls `executeFetch()`, which wraps the fetcher call in `try { … } catch (e) { throw normalizeHttpError(e); }` so errors reach the caller as `AuthError` / `ValidationError` / `ServerError` / `NetworkError`. With `retryConfig` set, `retryWithBackoff` wraps the whole thing.

---

## Fetchers — `src/fetchers/`

```typescript
type Fetcher = (config: FetcherConfig) => Promise<unknown>;
interface FetcherConfig {
  method: string;
  url: string;
  params?: Record<string, unknown>;
  data?: unknown;
  headers?: Record<string, string>;
}
```

- `createAxiosFetcher(axiosInstance)` — thin adapter. Returns `response.data`. Normalizes errors. The only built-in fetcher; anything else (`ofetch`, Apollo, native `fetch`) is a `Fetcher`-shaped function the consumer writes in their own project, not something this library ships or depends on.

---

## `useAuth(fetcher?)`

```typescript
const { login, logout } = useAuth();

await login(
  { email, password },   // params
  'local',               // persistence: 'local' | 'session' | 'cookie'
  { accessTokenPath, refreshTokenPath } // optional override
);

await logout({ reason: 'manual' }); // params optional; forwarded as request body
```

`login` extracts tokens via the configured (or per-call) paths, sets the session persistence, encrypts + stores the tokens, and returns the raw response.

`logout` POSTs to the logout endpoint, then unconditionally cleans credentials + fires `onLogout` (or `window.location.reload()`). **Errors from the POST are swallowed by design** — logout MUST terminate the local session regardless of network outcome.

---

## `refreshTokens(fetcher?)` — `src/services/refreshTokens.ts`

1. Reads the refresh token from storage using the session's persistence.
2. POSTs to `endpoints.REFRESH` with `{ [getRefreshTokenBodyKey()]: refreshToken }`.
3. Extracts new tokens via `getRefreshTokenPathsConfig()`.
4. Stores the new tokens under the same persistence.
5. On failure → cleans credentials, calls `onRefreshFailed` (or `window.location.reload()`), rethrows.

---

## Errors — `src/errors/`

```
BaseError (abstract, context: Record<string, unknown>)
├── NetworkError    (code: 'NETWORK_ERROR', statusCode?)
│   ├── static fromAxiosError(error)
│   └── static fromFetchError(error)
├── AuthError       (code: 'AUTH_ERROR', statusCode: 401)
│   └── static unauthorized/tokenExpired/tokenInvalid/tokenMissing
├── ValidationError (code: 'VALIDATION_ERROR', statusCode: 422, issues: ValidationIssue[])
│   └── static fromIssues/fromField
└── ServerError     (code: 'SERVER_ERROR', statusCode: number)
    └── static internal/badGateway/serviceUnavailable/gatewayTimeout
```

**`normalizeHttpError(error)` mapping**

| Input | Output |
|---|---|
| Already `BaseError` | Returned unchanged (idempotent) |
| HTTP shape with `status ∈ {401, 403}` | `AuthError` |
| HTTP shape with `status === 422` | `ValidationError` (with `issues[]` extracted) |
| HTTP shape with `status >= 500` | `ServerError` |
| Any other HTTP shape | `NetworkError` |
| Native `fetch` TypeError | `NetworkError.fromFetchError` |
| Anything else | Returned unchanged |

**Issue extraction** (best-effort, degrades to `[]`):
- Spring Boot `BindingResult` — `{ errors: [{ field, defaultMessage, rejectedValue }] }`
- NestJS `class-validator` — `{ message: string[] }`
- JSON:API — `{ errors: [{ source: { pointer }, detail, title }] }`
- Laravel — `{ errors: { field: string[] } }`

Original payload is preserved in `error.context.responseData`.

---

## Encryption + storage — `src/utils/`

### `encryption.ts`
AES-CBC via Web Crypto. Key derivation: `SHA-256(secret)`. Random 16-byte IV prefixed to the ciphertext (hex output).

```typescript
encrypt(plaintext: string, key: string): Promise<string>
decrypt(ciphertext: string, key: string): Promise<string>
```

### `storage.ts`
Reads/writes encrypted values across `localStorage` / `sessionStorage` / cookies. In SSR (no `window`) it falls back to cookies. `location = 'any'` reads in order session → local → cookie.

### `ssr.ts`
`isServer`, `isClient`, `getStorage()`, `getSessionStorage()`, `getCookieStorage()`, `getPreferredStorage()`, `type CookieOptions`.

### `retry.ts`
`retryWithBackoff(fn, config)`. Defaults: 3 retries, 1s → 10s cap, x2 multiplier. Retries on `statusCode >= 500`, `408`, `429`, or network-level errors. Configurable via `retryCondition`.

---

## Utils (survivors) — `src/utils/objects.ts`

- `safeGet(obj, keys[]): unknown` — used internally by `extractTokens` to dereference dot-notation paths.
- `objectToFormData(obj, form?, namespace?): FormData` — recursive; handles `File` / `Blob` / `ArrayBuffer` / `Date` (ISO) / arrays / booleans (`"0"` / `"1"`). Skips `null` / `undefined`. Guards against prototype pollution keys.

Also re-exported as a named export from `@/rest/RestStd` for convenience.

---

## Types (public surface)

| Type | Source |
|---|---|
| `PhalanxOptions` | Plugin options |
| `AxiosServiceOptions` | `{ baseURL, headers?, timeout?, withCredentials?, setupAuthInterceptors? }` |
| `Fetcher`, `FetcherConfig` | Fetcher abstraction |
| `LocationPreference` | `'local' \| 'session' \| 'cookie' \| 'any'` |
| `AuthTokenPaths`, `AuthResponse` | Auth |
| `EndpointsConfig`, `TokensConfig`, `SessionConfig` | Config shapes |
| `AppKeyConfig`, `TokenValidationResult` | Config / internal |
| `RestStd*Options` | `GetAll`, `GetOne`, `Create`, `Update`, `Patch`, `Delete`, `BulkCreate`, `BulkUpdate`, `BulkDelete`, `Upsert`, `CustomRequest` |
| `RetryConfig` | `retry.ts` |
| `ValidationIssue` | `errors/ValidationError` |
| `CookieOptions` | `utils/ssr` |

---

## TypeScript paths

```
@/*          → src/*
@config/*    → src/config/*
@rest/*      → src/rest/*
@services/*  → src/services/*
@types/*     → src/types/*
@utils/*     → src/utils/*
```

Aliases are rewritten to relative paths in the generated `.d.ts` files by `scripts/fix-dts-aliases.mjs` at build time.

---

## Build & release

```bash
pnpm install
pnpm build           # rollup + fix .d.ts aliases
pnpm eslint src/     # currently 0 errors, 0 warnings
pnpm release         # patch bump
pnpm release:minor
pnpm release:major
```

Rollup emits ESM only (`dist/index.mjs`) with `.d.ts` bundled. Externals: `vue`, `axios`, `jwt-decode`, `uuid`, `@tanstack/vue-query`.

No tests, no dev server.

---

## End-to-end auth flow

1. `app.use(Phalanx, options)` → singletons wired.
2. `useAuth().login(credentials, 'local')` → POST `/login` → `extractAndValidateTokens` → `configSession({ persistencePreference: 'local' })` → `storeTokens(access, refresh, 'local')` (AES + localStorage).
3. Each axios call → request interceptor injects `Authorization: Bearer <access>`.
4. On 401 (not the refresh call itself) → interceptor queues concurrent requests, calls `refreshTokens()`, releases queue with the fresh token, retries original.
5. On refresh failure → `cleanCredentials(persistence)` + `onRefreshFailed()` (fallback: reload).
6. `useAuth().logout()` → POST `/logout` (errors ignored) → `cleanCredentials` → `onLogout()` (fallback: reload).
