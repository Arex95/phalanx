# @arex95/vue-core

**REST + Auth foundation for Vue 3 apps.**

A base class for your REST resources. Automatic JWT refresh on 401. Encrypted token storage. A typed error hierarchy you can actually branch on. Nothing else.

```sh
pnpm add @arex95/vue-core
```

---

## Why this library?

Every Vue app repeats the same wiring: an axios instance with a Bearer interceptor, a queue that pauses requests while a refresh is in flight, encrypted tokens in `localStorage`, and a class that turns `/users`, `/products`, `/orders` into consistent CRUD calls.

`@arex95/vue-core` is that wiring — nothing more:

- **`RestStd`** — extend, override `resource`, get `getAll` / `getOne` / `create` / `update` / `patch` / `delete` / `bulk*` / `upsert` / `customRequest`.
- **Single-flight refresh** — a 401 pauses concurrent requests, refreshes once, retries the queue transparently.
- **Encrypted token storage** — AES-CBC via Web Crypto. Not plain text.
- **Typed errors** — `AuthError` / `ValidationError` / `ServerError` / `NetworkError` are actually produced by the normalizer; `instanceof` works.
- **Fetcher-agnostic** — Axios by default, `ofetch` supported, bring your own.
- **SSR-friendly** — set `setupAuthInterceptors: false` and handle headers yourself in Nuxt.

What we deliberately do **not** ship: debounces, breakpoints, string helpers, date utilities, `useFilter`/`useSorter`/`usePagination`, activity monitors. Those live in `@vueuse/core`, `date-fns`, `@tanstack/vue-query` — libraries that do them better than we ever will.

---

## Setup

```typescript
// main.ts
import { createApp } from 'vue';
import { ArexVueCore } from '@arex95/vue-core';

app.use(ArexVueCore, {
  appKey: import.meta.env.VITE_APP_KEY, // encrypts tokens at rest

  endpoints: {
    login:   'auth/login',
    refresh: 'auth/refresh',
    logout:  'auth/logout',
  },

  tokenKeys: {
    accessToken:  'myapp_access',
    refreshToken: 'myapp_refresh',
  },

  // Dot-notation paths to extract tokens from the login response
  tokenPaths: {
    accessToken:  'data.access_token',
    refreshToken: 'data.refresh_token',
  },
  refreshTokenPaths: {
    accessToken:  'data.access_token',
    refreshToken: 'data.refresh_token',
  },

  // Body key used when POSTing to the refresh endpoint.
  // Default: 'refresh_token'. Set to 'refreshToken' for Spring / NestJS backends.
  refreshTokenBodyKey: 'refresh_token',

  axios: {
    baseURL: import.meta.env.VITE_API_URL,
    headers: { 'X-API-Key': import.meta.env.VITE_API_KEY },
    setupAuthInterceptors: true, // set to false for Nuxt SSR
  },

  onRefreshFailed: () => router.push('/login'),
  onLogout:        () => router.push('/login'),
});
```

---

## `RestStd` — the core pattern

Extend and go:

```typescript
import { RestStd } from '@arex95/vue-core';

export class ProductService extends RestStd {
  static override resource = 'catalog/products';
}

const products = await ProductService.getAll<Product[]>({ params: { page: 1 } });
const product  = await ProductService.getOne<Product>({ id: 42 });
await ProductService.create<Product, ProductPayload>({ data: { name: 'Widget' } });
await ProductService.patch<Product>({ id: 42, data: { price: 9.99 } });
await ProductService.delete({ id: 42 });
```

### Custom endpoints

```typescript
export class CheckoutService extends RestStd {
  static override resource = 'sales/checkouts';

  static complete(data: PaymentData) {
    return this.customRequest<CompletionResponse>({
      method: 'POST',
      url: 'sales/checkout/complete',
      data,
    });
  }
}
```

### File uploads

Pass a `FormData` (or a `Blob` / `ArrayBuffer`) and the library sends it as multipart, letting the underlying client add the correct boundary. For plain objects, convert with the exported helper:

```typescript
import { objectToFormData } from '@arex95/vue-core';

await ProductService.create({
  data: objectToFormData({ name, image: file, tags: ['a', 'b'] }),
});
```

### Retry with backoff

```typescript
export class OrderService extends RestStd {
  static override resource = 'orders';
  static retryConfig = { retries: 3, retryDelay: 1000 };
}
```

Retries kick in on 5xx, 408, 429, and network errors — configurable via `retryCondition`.

---

## Authentication

```typescript
import { useAuth, verifyAuth, cleanCredentials } from '@arex95/vue-core';

const { login, logout } = useAuth();

// Storage: 'local' | 'session' | 'cookie'
await login({ email, password }, 'local');

const isAuthed = await verifyAuth(); // decodes JWT, checks exp

await logout();                // POST /logout, clears storage, calls onLogout
await cleanCredentials('any'); // wipe every storage location manually
```

### Automatic refresh

With `setupAuthInterceptors: true`, every 401 triggers a silent refresh:

```
Request → 401
  → POST /auth/refresh with { [refreshTokenBodyKey]: <token> }
  → new tokens stored (same storage location as before)
  → original request retried with the new access token
```

Concurrent requests that hit 401 while a refresh is in flight are queued and released with the fresh token — a single refresh per burst. If the refresh itself fails, `onRefreshFailed` is called (fallback: `window.location.reload()`).

---

## Typed errors

The library normalizes every HTTP error into a discriminable class before it reaches your `catch`:

```typescript
import { AuthError, ValidationError, ServerError, NetworkError } from '@arex95/vue-core';

try {
  await ProductService.create({ data });
} catch (error) {
  if (error instanceof AuthError)       return router.push('/login');
  if (error instanceof ValidationError) {
    error.issues.forEach(i => setFieldError(i.field, i.message));
    return;
  }
  if (error instanceof ServerError)     return showToast('Server unavailable, retrying…');
  if (error instanceof NetworkError)    return showToast(`Network error ${error.statusCode ?? ''}`);
  throw error;
}
```

Mapping:

| Status | Class | Extras |
|---|---|---|
| 401 / 403 | `AuthError` | — |
| 422 | `ValidationError` | `.issues[]` extracted from common shapes (Spring, NestJS, JSON:API, Laravel) |
| 5xx | `ServerError` | `.statusCode` |
| other HTTP | `NetworkError` | `.statusCode`, `.originalError` |
| native `fetch` TypeError | `NetworkError` | via `fromFetchError` |

Original payload is always preserved in `error.context.responseData`.

---

## Fetcher-agnostic

```typescript
import { createOfetchFetcher, configAuthFetcher } from '@arex95/vue-core';

// Use ofetch for auth requests
configAuthFetcher(createOfetchFetcher('https://api.example.com'));

// Or per-service
export class UserService extends RestStd {
  static override resource = 'users';
  static fetchFn = createOfetchFetcher('https://users.example.com');
}
```

Any function matching `(config: FetcherConfig) => Promise<unknown>` works. `ofetch` is an optional peer dependency — it's only imported when you actually call `createOfetchFetcher`.

---

## Token storage

| Location | Stores in | Persistence | Read by `'any'`? |
|---|---|---|---|
| `'local'` | `localStorage` | Until cleared | ✅ |
| `'session'` | `sessionStorage` | Until tab close | ✅ |
| `'cookie'` | `document.cookie` | Configurable expiry | ✅ |
| `'any'` | `localStorage` on write | — | — |

Tokens are encrypted with AES-CBC-256 (Web Crypto) before hitting any location. `'local'` is the recommended default for SPAs.

---

## Nuxt / SSR

```typescript
// plugins/arex-core.ts
export default defineNuxtPlugin({
  enforce: 'pre',
  setup(nuxt) {
    const config = useRuntimeConfig();
    nuxt.vueApp.use(ArexVueCore, {
      appKey: config.public.appKey,
      // ...
      axios: {
        baseURL: config.public.apiUrl,
        setupAuthInterceptors: false, // you attach headers manually
      },
      onRefreshFailed: () => navigateTo('/login'),
    });
  },
});
```

With `setupAuthInterceptors: false` the library skips interceptor setup and lets you inject the `Authorization` header from your own server plugin (essential for SSR where `localStorage` doesn't exist).

---

## Requirements

- Vue 3
- Node.js 15+ (Web Crypto API required for token encryption)
- Peer deps: `vue`, `axios`, `jwt-decode`, `uuid`
- Optional peer dep: `ofetch` (only needed if you use `createOfetchFetcher`)

## License

MIT
