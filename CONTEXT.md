# CONTEXT.md — `@arex95/phalanx` — internal reference

> Working reference for this repo: architecture, contracts, module behaviour.
> For the user-facing version see `docs/` (published at
> https://arex95.github.io/phalanx/). This file is the one that says what is
> awkward, not just what is true.

---

## Identity

- **Package:** `@arex95/phalanx` (v6.0.0). Was `@arex95/vue-core` through v5.1.0.
- **Scope:** REST + Auth foundation for Vue 3 admin panels. No components, no styles.
- **Build:** Rollup → `dist/index.mjs` (ESM only). `"sideEffects": false`.
- **Entry:** `src/index.ts` · **Package manager:** `pnpm`
- **Peers (exactly four):** `vue`, `axios`, `@tanstack/vue-query`, `jwt-decode`.

Anything duplicating `@vueuse/core`, `date-fns`, `zod`, `lodash` or belonging to
an unrelated toolkit (DOM helpers, breakpoints, monitoring, debounces, strings,
dates, validations, `handleError`) was removed in the v6 lean rewrite.

---

## Plugin install

```typescript
import { Phalanx } from '@arex95/phalanx';

app.use(Phalanx, {
  endpoints:         { login: '/auth/login', refresh: '/auth/refresh', logout: '/auth/logout' },
  tokenPaths:        { accessToken: 'data.access_token' },
  refreshTokenPaths: { accessToken: 'data.access_token' },
  csrf:              { headerName: 'X-XSRF-TOKEN', cookieName: 'XSRF-TOKEN' },  // optional
  encryption:        { publicKeyPem: '…' },                                     // optional
  axios: {
    baseURL: 'https://api.example.com',
    withCredentials: true,          // required cross-origin, or the cookie is dropped
    setupAuthInterceptors: true,    // false for Nuxt SSR
  },
  onRefreshFailed: () => router.push('/login'),
  onLogout:        () => router.push('/login'),
});
```

`install()` calls, in order:
`configEndpoints → configTokenPaths → configRefreshTokenPaths → configCsrf →
configEncryption → configAxios → configCallbacks`.

**There is no `appKey`, no `tokenKeys`, no `refreshTokenBodyKey`, and no storage
mode.** All four were removed in v6 — see *Auth model* below.

---

## Source layout

```
src/
├── index.ts                     Vue plugin + re-exports
├── actions/                     defineAction, actionBehaviour
├── composables/
│   ├── auth/useAuth.ts          login / logout
│   ├── queries/                 createDomainQueries, toJsonApi
│   └── mutations/               createDomainMutations, crudAugment.typecheck.ts
├── config/
│   ├── global/                  endpoints, tokenPaths, refreshTokenPaths,
│   │                            csrf, encryption, callbacks
│   ├── axios/                   AxiosService (401 interceptor) + singleton getter
│   └── auth/                    authFetcher factory
├── crypto/encryptField.ts       hybrid AES-GCM + RSA-OAEP for outbound data
├── http/                        createHeaderInterceptor, idempotency keys
├── health/backendHealth.ts      shared "is the API up" signal
├── realtime/                    backoff, connectionMachine (pure), RealtimeConnection
├── rest/RestStd.ts              base CRUD class
├── services/                    accessToken, extractTokens, refreshTokens, credentials
├── errors/                      BaseError → Network | Auth | Validation | Server
│                                + normalize.ts (status → typed class)
├── enums/contentTypesEnums.ts   only `ContentTypeEnum` survives
├── types/                       public type surface only
└── utils/                       encryption, storage, ssr, retry, safeGet, objectToFormData
```

---

## Auth model — read this before touching anything auth-shaped

| | Where it lives | Readable by script |
|---|---|---|
| Access token | module-level `ref` in `services/accessToken.ts` | yes, until reload |
| Refresh token | `HttpOnly` cookie set by the backend | **no** |

v5 encrypted the access token with `appKey` and put it in `localStorage`. The
key shipped in the bundle, so any injected script could read it exactly as the
library did. The `'cookie'` mode was `document.cookie` written from JavaScript,
which is by definition not `HttpOnly`. Both were removed rather than fixed:
**a browser cannot keep a secret from script running in its own page.**

Consequences that will surprise you:

- A page reload loses the access token. That is the mechanism, not a bug — the
  app refreshes, and the credential the refresh depends on is one JS never sees.
- **Half the flow is the backend's.** Nothing works end to end until the API
  emits `Set-Cookie … HttpOnly` and stops returning the refresh token in the
  body. Full requirement: `docs/concepts/backend-contract.md`.
- `isAuthenticated` reports **presence**, not validity. `verifyAuth()` is the
  expiry-aware answer; it is synchronous and clears the token on all three
  failure branches (missing `exp`, expired, malformed).
- `utils/encryption.ts` and `utils/storage.ts` still exist and still do
  encrypted storage. **They are not for tokens.** They survive for consumers
  that use them for other things.

---

## Config singletons

Each module owns a private variable plus a `configX()` / `getX()` pair, set at
install.

| Module | Setter | Getter | Notes |
|---|---|---|---|
| `endpointsConfig` | `configEndpoints({loginEndpoint, refreshEndpoint, logoutEndpoint})` | `getEndpointsConfig()` | **Defaults to `/login`, `/refresh`, `/logout` if never configured** — it does not throw |
| `tokenPathsConfig` | `configTokenPaths({accessTokenPath})` | `getTokenPathsConfig()` | dot-notation, login response |
| `refreshTokenPathsConfig` | `configRefreshTokenPaths({accessTokenPath})` | `getRefreshTokenPathsConfig()` | separate on purpose: refresh responses differ |
| `csrfConfig` | `configCsrf({headerName, cookieName})` | `getCsrfConfig()` | **returns `null` when unset** |
| `encryptionConfig` | `configEncryption({publicKeyPem})` | `getEncryptionPublicKeyPem()` | **throws when unset** — the only one that does |
| `callbacksConfig` | `configCallbacks({onRefreshFailed?, onLogout?})` | `getCallbacksConfig()` | fallback is `window.location.reload()` |
| `axios/axiosInstance` | `configAxios(options)` | `getConfiguredAxiosInstance()` | builds the `AxiosService` singleton, wires `setDefaultAuthFetcherFactory()` |
| `auth/authFetcher` | `configAuthFetcher(fetcher)` / `setDefaultAuthFetcherFactory(factory)` | `getDefaultAuthFetcher()` | throws if neither set |

**The inconsistency is deliberate to note, not to rely on:** forget the plugin
and auth silently posts to `/login` against the axios `baseURL`. Only encryption
fails loudly.

These are **module singletons**. One configuration per process — correct in a
browser, wrong in SSR request handling. Never drive them from a request handler.

---

## `AxiosService` — `config/axios/axiosConfig.ts`

**Request interceptor:** reads the access token from memory (synchronously — no
storage, no `await`) and sets `Authorization: Bearer <token>`. Attaches the
shared `cancelToken`, increments `activeRequests`. The CSRF header is added
**only** when the URL is the refresh or logout endpoint; every other request
carries a bearer header and is CSRF-immune by construction.

**Response, 401 flow:**
- Skipped when the failing call *is* the refresh endpoint, is already a retry,
  or is not a 401.
- A refresh already in flight → the failing request is queued, not duplicated.
- Otherwise: mark `_retry`, call `refreshTokens()`, release the queue with the
  new token, replay the original.
- Refresh failure → reject the queue with that error and reject the original.
- SSR-safe: refresh is skipped entirely when `window === undefined`.

`setupAuthInterceptors: false` → the constructor skips `initializeInterceptors()`,
and the flag **is** forwarded by `configAxios()` / `getConfiguredAxiosInstance()`.
It was inert once; there are tests pinning it now.

Public methods: `getActiveRequests()`, `getAxiosInstance()`,
`cancelAllRequests()`, `setHeader(k,v)`, `removeHeader(k)`.

**Known gap:** the constructor does not forward `options.adapter` to
`axios.create()`. Tests that need a fake adapter must override
`defaults.adapter` after construction — see `createTestService` in
`axiosConfig.test.ts`. A fake adapter passed through options is silently ignored
and the real XHR path runs instead.

---

## `RestStd` — `src/rest/RestStd.ts`

Static class. Extend and override `resource`.

```typescript
export class Role extends RestStd {
    static override resource = 'roles';
    // static headers = { 'X-Tenant': 'acme' };
    // static fetchFn = createAxiosFetcher(customInstance);
    // static retryConfig = { retries: 3, retryDelay: 1000, maxRetryDelay: 10000 };
}
```

**Methods** — all `async`, all returning a Promise. That matters: validation
failures used to throw synchronously, so `await Service.create(...)` inside a
`try` escaped the `catch`.

- `getAll(options?)` / `getOne({id})` — reads
- `create({data})` / `update({id,data})` / `patch({id,data})` — writes
- `delete({id})` / `bulkDelete({ids})`
- `bulkCreate({data:[…]})` / `bulkUpdate({data:[…]})` → `/{resource}/bulk`
- `upsert({data})` → `update` when `data.id` is **neither `undefined` nor
  `null`** (so `0` and `''` are real ids and mean update), else `create`
- `customRequest({method, url, params, data})` — **takes a full `url` and does
  not prefix `resource`.** Build the path yourself.

`buildUrl` distinguishes `suffix === undefined` from a falsy suffix, because
`''` is a legitimate suffix. `!suffix` was a bug.

**Body serialization** — centralised in the private `prepareWrite(data)`:
`FormData` / `Blob` / `ArrayBuffer` go as-is with no `Content-Type` (the client
emits the multipart boundary); anything else non-nullish gets
`application/json`. There is no `isFormData` flag; it was removed.

`executeFetch()` wraps every call in `catch (e) { throw normalizeHttpError(e); }`,
so callers always receive a typed error. With `retryConfig`, `retryWithBackoff`
wraps the whole thing.

---

## Domain composables

**`createDomainQueries({service, keys, module?, model?})`** → `getAll`,
`getOne`, `keys`, plus one query per custom service method with its inferred
return type and an imperative `.fetch()`.

**`createDomainMutations({service, keys, model?, invalidate?, actions?, …ActionInjection})`**
→ `create`, `update`, `patch`, `remove`, plus one mutation per custom method.

Invalidation resolves in three layers: the default `keys.all`/`keys.one`, then
`config.invalidate[method]`, then `ActionMeta.invalidate`, which wins.
`{ only: [...] }` replaces the defaults instead of extending them.

**Type-level constraint:** a custom mutation takes **at most one argument**.
Two-parameter methods cannot be expressed in the inferred signature and are
skipped. Pass an object.

`getAll` and `getOne` are wrapped in `ownerScope.run(...)`
(`createDomainQueries.ts:164,193`) like the custom-method proxy. For a while
only the custom methods were, and the CRUD queries leaked their reactive scope.

**`crudAugment.typecheck.ts` is not a vitest test.** Vitest does not typecheck.
That file exists so `vue-tsc` verifies `@ts-expect-error` directives asserting
that `isAuthorized` is absent where no action was configured. An "unused
`@ts-expect-error` directive" there means a type guarantee broke.

Two traps hide in this area, both of which compiled clean and passed every test:

- `Record<string, never>` carries an **implicit index signature**, so property
  access on it always compiles. The empty type is `Record<never, never>`.
- A naked conditional type **distributes over unions**, and
  `UseMutationReturnType` *is* a union. Use `[T] extends [X]`.

---

## Actions — `src/actions/`

`defineAction(fn, meta)` attaches `ActionMeta` to a service method:
`permission`, `requiresConfirmation`, `confirm*MessageKey`, `success/errorMessageKey`,
`notifyOptions`, `invalidate`.

`withActionBehaviour` wraps **both `mutate` and `mutateAsync`**. It wrapped only
`mutate` once, so `mutateAsync` bypassed confirmation entirely.

Declining behaves differently by design: `mutate` returns `void` and simply does
nothing; `mutateAsync` **rejects with `ActionCancelledError`**, because an
unsettled Promise would hang the `await` forever.

The host application injects `checkPermission`, `requestConfirmation`,
`translate` and `notify`. Omit any and that concern is skipped silently — no
throw. `defaultNotify` / `defaultRequestConfirmation` are bare `window`
implementations for prototyping only.

---

## Fetchers — `src/fetchers/`

```typescript
type Fetcher = (config: FetcherConfig) => Promise<unknown>;
interface FetcherConfig {
  method: string; url: string;
  params?: Record<string, unknown>; data?: unknown;
  headers?: Record<string, string>;
}
```

`createAxiosFetcher(axiosInstance)` is the only built-in one: returns
`response.data`, normalizes errors. `ofetch`, Apollo or native `fetch` are
`Fetcher`-shaped functions a consumer writes in their own project — the library
neither ships nor depends on them.

---

## `useAuth(fetcher?)`

```typescript
const { login, logout } = useAuth();
await login({ email, password });   // optional 2nd arg overrides tokenPaths
await logout({ reason: 'manual' }); // params forwarded as the request body
```

`login` extracts the access token via the configured paths and puts it in
memory. The backend is expected to set the refresh cookie in the same response.

`logout` POSTs, then **unconditionally** clears the token and fires `onLogout`
(fallback: reload). Errors from the POST are swallowed by design — a user who
clicks log out on a broken network is still logged out locally.

## `refreshTokens(fetcher?)`

POSTs to `endpoints.REFRESH` **with no body** — the refresh token rides in the
cookie the browser attaches. Extracts the new access token via
`getRefreshTokenPathsConfig()`, stores it in memory. On failure: clears the
token, calls `onRefreshFailed` (fallback: reload), rethrows.

---

## Errors — `src/errors/`

```
BaseError (abstract, context: Record<string, unknown>)
├── NetworkError    ('NETWORK_ERROR', statusCode?)   fromAxiosError / fromFetchError
├── AuthError       ('AUTH_ERROR', 401)              unauthorized / tokenExpired / tokenInvalid / tokenMissing
├── ValidationError ('VALIDATION_ERROR', 422, issues[])  fromIssues / fromField
└── ServerError     ('SERVER_ERROR', number)         internal / badGateway / serviceUnavailable / gatewayTimeout
```

`normalizeHttpError(error)`: already a `BaseError` → unchanged (idempotent);
401/403 → `AuthError`; 422 → `ValidationError` with issues extracted;
≥500 → `ServerError`; any other HTTP shape → `NetworkError`; native fetch
`TypeError` → `NetworkError.fromFetchError`; anything else → unchanged.

Issue extraction is best-effort and degrades to `[]`: Spring `BindingResult`,
NestJS `class-validator`, JSON:API pointers, Laravel `errors{}`.

**`context` preserves the response body, the status AND the response headers.**
Headers were dropped once, which silently broke every consumer reading an error
code out of `x-error-code`.

---

## Crypto — `src/crypto/encryptField.ts`

A fresh AES-256-GCM key per call encrypts the value; the key is wrapped with the
configured RSA-OAEP public key and discarded. Returns
`{ encryptedKey, iv, ciphertext }`.

Hybrid because RSA-OAEP with a 2048-bit key tops out around 190 bytes. This is
sound where token encryption was not: outbound data is never read back, so
shipping the public key costs nothing. `getPublicKey()` caches the imported
`CryptoKey` against the exact PEM string — a test that must exercise a
non-cached path has to change the PEM, not just the input.

---

## Realtime

`connectionMachine.ts` is a pure reducer: `(state, event, ctx, backoff) →
{ state, effects }`. It owns no socket, timer or clock, which is why every
transition — including the ones that only happen during an outage — is testable
without opening a connection. `RealtimeConnection` runs the effects.

**The transport is injected.** The admin this came from used
`@microsoft/fetch-event-source`; adding that as a dependency would tie every
consumer to it, so `open(ctx)` receives `{ token, signal, onOpen, onAuthError,
onConnectError, onStreamError }` and the consumer wires whatever it wants.

`RealtimeConnection.openStream` has a `!token` guard that coverage cannot
reach: the `watch` on `accessToken` dispatches `authCleared` before the effect
runs. It stays as a guard, not as dead code to delete.

## Backend health

Module-level signal with a threshold (2) and a window (8 s). It does **not**
import a query client — "recover" is the application's decision, so callers
register handlers with `onBackendRecovered`. `resetBackendHealth()` exists for
tests.

## Utils

- `safeGet(obj, keys[])` — dot-path dereference, used by `extractTokens`.
- `objectToFormData(obj, form?, ns?)` — recursive; `File`/`Blob`/`ArrayBuffer`/
  `Date` (ISO)/arrays/booleans (`"0"`/`"1"`); skips nullish; guards prototype
  pollution keys. Also re-exported from `@/rest/RestStd`.
- `retryWithBackoff(fn, config)` — 3 retries, 1s → 10s cap, ×2. Retries ≥500,
  408, 429 and network errors. **No jitter**, so a fleet recovering from one
  outage retries in step.
- `ssr.ts` — `isServer`, `isClient`, `getStorage()`, `getSessionStorage()`,
  `getCookieStorage()`, `getPreferredStorage()`, `CookieOptions`.

---

## TypeScript paths

```
@/*  @composables/*  @config/*  @enums/*  @rest/*  @services/*  @types/*  @utils/*
```

Rollup does not rewrite these in the emitted `.d.ts`;
`scripts/fix-dts-aliases.mjs` does, at build time. It carries its own
post-condition — every relative import must resolve on disk, every bare import
must be a declared dependency — and **exits non-zero otherwise**. That check is
deliberately independent of the rewriting predicate: an earlier version reused
it and therefore validated nothing. It also skips block comments, so JSDoc
`@example` blocks are not mistaken for real imports.

---

## Build, test, release

```bash
pnpm build           # rollup + fix-dts-aliases
pnpm test            # 322 tests / 24 files, 97.4% statements
pnpm typecheck       # vue-tsc, source
pnpm typecheck:test  # tsc -p tsconfig.test.json
pnpm lint            # eslint . — the whole repo
pnpm release[:minor|:major]
```

`prepublishOnly` runs typecheck + typecheck:test + lint + test + build. Before
it existed nothing stood between a broken tree and npm.

Tests live beside their sources and are excluded from the build tsconfig, so
they never reach the published `.d.ts`.

---

## End-to-end auth flow

1. `app.use(Phalanx, options)` → singletons wired.
2. `useAuth().login(creds)` → POST `/login` → access token into memory; backend
   sets the `HttpOnly` refresh cookie in the same response.
3. Every axios call → request interceptor injects `Authorization: Bearer …`
   from memory, synchronously.
4. On 401 (never the refresh call itself) → concurrent requests queue, one
   `refreshTokens()` goes out **with no body**, queue releases with the new
   token, original replays.
5. Refresh failure → token cleared, `onRefreshFailed()` (fallback: reload).
6. `logout()` → POST (errors ignored) → token cleared → `onLogout()`.
