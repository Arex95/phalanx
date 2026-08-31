# Authentication

The access token lives in memory. The refresh token lives in a cookie the
library cannot read. Nothing about the session is written to `localStorage`,
`sessionStorage`, or a cookie set from JavaScript.

For why, see [Session handling](/concepts/session). This page is how to use it.

## Logging in

```ts
import { useAuth } from '@arex95/phalanx';

const { login, logout } = useAuth();

await login({ email, password });
```

`login` posts to the configured endpoint, extracts the access token using
`tokenPaths`, and stores it in memory. The backend is expected to set the
refresh cookie in the same response.

## Reading the session

```ts
import { accessToken, isAuthenticated, getAccessToken } from '@arex95/phalanx';
```

| Export | What it is |
|---|---|
| `accessToken` | `ComputedRef<string \| null>` — reactive, for templates |
| `isAuthenticated` | `ComputedRef<boolean>` — **presence**, not validity |
| `getAccessToken()` | the raw value, for non-reactive code |
| `setAccessToken(t)` | overwrite it — rarely needed outside the library |

`isAuthenticated` tells you a token is present. It does **not** tell you the
token is still valid. For the expiry-aware answer:

```ts
import { verifyAuth } from '@arex95/phalanx';

if (!verifyAuth()) router.push({ name: 'login' });
```

`verifyAuth()` is synchronous. It decodes the token, compares `exp`, and clears
the token if it is missing, expired, or malformed — all three.

## Refreshing

You do not call it. The axios response interceptor does, on the first 401:

1. A 401 arrives.
2. One refresh request goes out — **with no body**. The refresh token rides in
   the cookie the browser attaches automatically.
3. Requests that arrived during the refresh are queued, not duplicated.
4. On success, the queue replays with the new token.
5. On failure, the token is cleared and `onRefreshFailed` fires — or the page
   reloads, if you did not provide it.

Only one refresh is ever in flight. Ten parallel 401s produce one refresh
request, not ten.

`refreshTokens()` is exported if you need to force it.

## Logging out

```ts
await logout();
```

The local session is cleared whether the request succeeds, fails or times out,
then `onLogout` fires. Logging out is not blocked by a network error.

## CSRF

Only refresh and logout carry the CSRF header, because only they ride on an
automatically attached cookie. Configure it and the header is read from the
readable CSRF cookie and mirrored into the request:

```ts
csrf: { headerName: 'X-XSRF-TOKEN', cookieName: 'XSRF-TOKEN' }
```

Requests carrying a bearer header do not need it: a cross-site page cannot set
that header.

## Driving auth yourself

`setupAuthInterceptors: false` leaves you a configured axios instance with no
auth behaviour attached. `configAuthFetcher()` replaces the transport used for
the login, refresh and logout calls without touching the rest.
