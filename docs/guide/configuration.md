# Configuration

Everything is passed once, to `app.use(Phalanx, options)`. The plugin
initialises the configuration singletons in a fixed order: endpoints →
token paths → refresh token paths → CSRF → encryption → axios → callbacks.

## Options

```ts
interface PhalanxOptions {
    endpoints: { login: string; refresh: string; logout: string };
    tokenPaths: { accessToken: string };
    refreshTokenPaths: { accessToken: string };
    csrf?: { headerName: string; cookieName: string };
    encryption?: { publicKeyPem: string };
    axios: AxiosServiceOptions;
    onRefreshFailed?: () => void;
    onLogout?: () => void;
}
```

### `endpoints`

The three authentication routes, relative to the axios `baseURL`.

### `tokenPaths` and `refreshTokenPaths`

Dot-notation paths to the access token inside each response body. They are
separate because login and refresh responses often differ in shape.

```ts
tokenPaths: { accessToken: 'data.access_token' },   // POST /auth/login
refreshTokenPaths: { accessToken: 'access_token' }  // POST /auth/refresh
```

There is no path for the refresh token. Phalanx never reads one — it lives in
an `HttpOnly` cookie that JavaScript cannot see. That is the point.

### `csrf`

```ts
csrf: { headerName: 'X-XSRF-TOKEN', cookieName: 'XSRF-TOKEN' }
```

Enables Double Submit Cookie on **refresh and logout only**. Those are the only
requests that ride on an automatically attached cookie, so they are the only
ones exposed to CSRF. Requests carrying a bearer header are immune by
construction and get no extra header.

Omit the option and no CSRF header is sent.

### `encryption`

```ts
encryption: { publicKeyPem: import.meta.env.VITE_ENCRYPTION_PUBLIC_KEY }
```

Only needed if you call `encryptField()`. See
[Field encryption](/guide/field-encryption).

### `axios`

```ts
axios: {
    baseURL: string;
    headers?: Record<string, string>;
    timeout?: number;
    withCredentials?: boolean;
    setupAuthInterceptors?: boolean;
}
```

`setupAuthInterceptors: false` disables the bearer-token and 401-refresh
interceptors entirely, leaving a plain configured axios instance. Use it when
you want to drive auth yourself.

### `onRefreshFailed` and `onLogout`

Called when the session ends — a rejected refresh, or a completed logout. The
default is `window.location.reload()`, which discards unsaved state. Provide
them to route instead:

```ts
onRefreshFailed: () => router.push({ name: 'login' }),
onLogout: () => router.push({ name: 'login' })
```

## Reading configuration back

Every config singleton has a getter — `getEndpointsConfig()`,
`getTokenPathsConfig()`, `getCsrfConfig()`, `getCallbacksConfig()`,
`getEncryptionPublicKeyPem()`.

They do **not** behave the same way when read before the plugin is installed,
and the difference matters:

| Getter | Before `app.use(Phalanx, …)` |
|---|---|
| `getEndpointsConfig()` | returns the defaults `/login`, `/refresh`, `/logout` |
| `getCsrfConfig()` | returns `null` — no CSRF header is sent |
| `getEncryptionPublicKeyPem()` | **throws** |

Install the plugin before anything issues a request. Without it, auth calls go
to the default paths against the axios `baseURL`.
