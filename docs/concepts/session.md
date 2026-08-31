# Session handling

Phalanx keeps the access token in memory and expects the refresh token in a
cookie set by your server.

```ts
import { accessToken, isAuthenticated, getAccessToken } from '@arex95/phalanx';
```

| Credential | Location | Lifetime |
|---|---|---|
| Access token | module-level Vue `ref` | until the page unloads |
| Refresh token | `HttpOnly` cookie set by the server | whatever the server sets |

Nothing is written to `localStorage`, `sessionStorage`, or a cookie set from
JavaScript. A page reload starts with no access token and obtains one from
`POST /auth/refresh`.

## Reading it

`accessToken` and `isAuthenticated` are `ComputedRef`s, so they work directly in
templates and watchers. `getAccessToken()` returns the raw value for
non-reactive code.

`isAuthenticated` reports whether a token is present. It does not decode it. Use
`verifyAuth()` when you need the expiry-aware answer:

```ts
import { verifyAuth } from '@arex95/phalanx';

router.beforeEach((to) => {
    if (to.meta.requiresAuth && !verifyAuth()) return { name: 'login' };
});
```

`verifyAuth()` is synchronous. It decodes `exp` and clears the token when it is
missing, expired, or malformed.

## Refresh

The axios response interceptor handles this. On a 401 it issues one refresh
request and queues everything that arrives while it is in flight:

```
401 ──┐
401 ──┼──▶ one POST /auth/refresh ──▶ queue replays with the new token
401 ──┘
```

The refresh request carries no body — the token travels in the cookie the
browser attaches. Ten concurrent 401s produce one refresh, not ten.

`refreshTokens()` is exported if you need to trigger it yourself.

## CSRF

Cookies are attached to cross-site requests automatically, so the refresh and
logout calls accept a Double Submit Cookie header. Configure it and Phalanx
mirrors the readable CSRF cookie into the request:

```ts
csrf: { headerName: 'X-XSRF-TOKEN', cookieName: 'XSRF-TOKEN' }
```

The header is sent on the refresh and logout endpoints only. Every other request
authenticates with a bearer header, which a cross-site page cannot set.

Omit the option and no CSRF header is sent.

## Scope

An in-memory token is not readable after the tab closes and is not recoverable
from disk. Script running inside the page can still use it while the page is
open — the boundary this draws is around the refresh token, which the page
cannot read at all.

For a token that no browser code can touch, put a backend-for-frontend in front
of the API and keep both credentials server-side ([RFC 9700 §6.2][rfc]).
Phalanx targets the case where the SPA talks to the API directly.

[rfc]: https://datatracker.ietf.org/doc/html/rfc9700
