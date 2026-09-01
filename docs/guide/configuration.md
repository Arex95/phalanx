# Configuration

All configuration is passed to `app.use(Phalanx, options)`.

```ts
interface PhalanxOptions {
    endpoints:          { login: string; refresh: string; logout: string };
    tokenPaths:         { accessToken: string };
    refreshTokenPaths:  { accessToken: string };
    axios:              AxiosServiceOptions;
    csrf?:              { headerName: string; cookieName: string };
    encryption?:        { publicKeyPem: string };
    onRefreshFailed?:   () => void;
    onLogout?:          () => void;
}
```

## `endpoints`

The three authentication routes, resolved against the axios `baseURL`.

## `tokenPaths` · `refreshTokenPaths`

Dot-notation paths to the access token in each response body.

```ts
tokenPaths:        { accessToken: 'data.access_token' },  // POST /auth/login
refreshTokenPaths: { accessToken: 'access_token' }        // POST /auth/refresh
```

They are separate because login and refresh responses often differ in shape.
There is no path for the refresh token: it is read from a cookie by the browser,
not from the body by Phalanx.

## `axios`

```ts
interface AxiosServiceOptions {
    baseURL: string;
    headers?: Record<string, string>;
    timeout?: number;
    withCredentials?: boolean;
    setupAuthInterceptors?: boolean;   // default: true
}
```

`withCredentials: true` is required for the refresh cookie to travel on a
cross-origin API.

`setupAuthInterceptors: false` returns a configured axios instance with no
bearer-token or 401-refresh interceptors attached — useful under SSR, or when
the application drives authentication itself.

## `csrf`

```ts
csrf: { headerName: 'X-XSRF-TOKEN', cookieName: 'XSRF-TOKEN' }
```

Mirrors the readable CSRF cookie into a header on the refresh and logout
requests, which are the two that travel on an automatically attached cookie.
Requests carrying a bearer header are not affected.

Omitted, no CSRF header is sent.

## `encryption`

```ts
encryption: { publicKeyPem: import.meta.env.VITE_ENCRYPTION_PUBLIC_KEY }
```

Required only by [`encryptField()`](/guide/field-encryption).

## `onRefreshFailed` · `onLogout`

Called when the session ends — a rejected refresh, or a completed logout.

```ts
onRefreshFailed: () => router.push({ name: 'login' }),
onLogout:        () => router.push({ name: 'login' })
```

Default: `window.location.reload()`.

## Reading configuration back

Each option has a getter, useful in tests and in code that runs outside a
component.

| Getter | Returns before the plugin is installed |
|---|---|
| `getEndpointsConfig()` | the defaults `/login`, `/refresh`, `/logout` |
| `getTokenPathsConfig()` · `getRefreshTokenPathsConfig()` | `{ accessTokenPath: 'data.access_token' }` |
| `getCsrfConfig()` | `null` |
| `getCallbacksConfig()` | `{}` |
| `getEncryptionPublicKeyPem()` | throws |
| `getConfiguredAxiosInstance()` | lazily creates an instance with axios defaults |

Install the plugin before any code issues a request.

## Per-service overrides

Options that vary by resource are set on the service rather than globally:

```ts
class UserService extends RestStd {
    static resource = 'users';
    static headers = { 'X-Tenant': tenantId };
    static retryConfig = { retries: 3 };
    static fetchFn = createAxiosFetcher(anotherInstance);
}
```

See [Services](/guide/services).
