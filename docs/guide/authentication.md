# Authentication

`useAuth` provides login and logout. Everything else — attaching the bearer
header, refreshing on a 401, queueing concurrent requests — happens in the axios
interceptors.

```ts
import { useAuth } from '@arex95/phalanx';

const { login, logout } = useAuth();
```

## Logging in

```ts
await login({ email, password });
```

The credentials are posted to the configured login endpoint. The access token is
read from the response with `tokenPaths` and held in memory; the refresh token
is set by the server as a cookie.

`login` returns the raw response, so anything else it carries is available:

```ts
const response = await login({ email, password });
user.value = response.data.user;
```

A second argument overrides the token paths for that call.

## Logging out

```ts
await logout();
await logout({ everywhere: true });   // params are sent as the request body
```

The local session is cleared whether the request succeeds, fails or times out,
then `onLogout` fires.

## Session state

```ts
import { accessToken, isAuthenticated, verifyAuth } from '@arex95/phalanx';
```

| Export | |
|---|---|
| `accessToken` | `ComputedRef<string \| null>` |
| `isAuthenticated` | `ComputedRef<boolean>` — whether a token is present |
| `getAccessToken()` | the raw value, for non-reactive code |
| `verifyAuth()` | decodes `exp`; clears the token when invalid |
| `setAccessToken(token)` | for applications that obtain the token elsewhere |

`isAuthenticated` does not decode the token. Use `verifyAuth()` where expiry
matters:

```ts
router.beforeEach((to) => {
    if (to.meta.requiresAuth && !verifyAuth()) return { name: 'login' };
});
```

## Refresh

The response interceptor issues one refresh on the first 401 and queues
everything that arrives meanwhile. Ten concurrent 401s produce one refresh
request.

The refresh request carries no body — the token travels in the cookie. On
failure the token is cleared and `onRefreshFailed` fires.

`refreshTokens()` is exported for applications that need to trigger it.

For where each credential lives, see [Session handling](/concepts/session).

## Custom transports

```ts
const { login } = useAuth(myFetcher);   // this call only
configAuthFetcher(myFetcher);           // login, refresh and logout
```

`setupAuthInterceptors: false` in the axios options leaves a configured instance
with no auth behaviour attached, for applications driving authentication
themselves.

## Server-side rendering

The token lives in a module-level ref, which is shared across requests on a
server. Under SSR, disable the interceptors and inject the header per request
instead:

```ts
axios: { baseURL, setupAuthInterceptors: false }
```

The refresh flow is skipped when `window` is undefined.
