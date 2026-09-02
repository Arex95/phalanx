# Server requirements

Phalanx reads the access token from the login and refresh responses, and relies
on the browser to attach the refresh cookie. Three things on the server side
decide whether that works.

## 1 · The login response

```http
HTTP/1.1 200 OK
Set-Cookie: refresh_token=…; HttpOnly; Secure; SameSite=None; Path=/auth/refresh
Content-Type: application/json

{ "data": { "access_token": "eyJ…" } }
```

The access token is read with the dot path in `tokenPaths`; the refresh token is
not read at all.

| Attribute | Value | Effect |
|---|---|---|
| `HttpOnly` | — | keeps the cookie out of `document.cookie` |
| `Secure` | — | required by browsers whenever `SameSite=None` |
| `SameSite` | `None` cross-site, `Lax` same-site | decides whether the cookie is attached |
| `Path` | the refresh route | limits where the cookie is sent |

If the response also returns the refresh token in the body, Phalanx ignores it.

## 2 · The refresh endpoint

`POST /auth/refresh` arrives with an empty body. Read the token from the cookie
and return a new access token, shaped however `refreshResponsePaths` describes:

```json
{ "data": { "access_token": "eyJ…" } }
```

Rotating the refresh cookie on each call is supported and needs no client
change.

## 3 · CORS, when the API is on another origin

```http
Access-Control-Allow-Origin: https://admin.example.com
Access-Control-Allow-Credentials: true
```

Browsers reject `Access-Control-Allow-Origin: *` on credentialed requests, so
the origin has to be named. On the client, `withCredentials: true`.

::: tip Symptoms of getting this wrong
The refresh request arrives with no cookie and the server answers 401. The
browser reports no CORS error, because the request itself succeeded — only the
cookie was dropped. Check the request in DevTools → Network → Cookies, which
lists cookies that were not sent and why.
:::

## Same-origin setups

Behind a reverse proxy where the API and the app share an origin, `SameSite=Lax`
is enough, `withCredentials` is not needed, and the CORS headers do not apply.

## Optional

**CSRF.** If you enable `csrf`, set a second, readable cookie and validate the
mirrored header on refresh and logout:

```http
Set-Cookie: XSRF-TOKEN=…; Secure; SameSite=None; Path=/
```

**Reuse detection.** Rotation pairs well with invalidating a token family when a
refresh token is presented twice. Phalanx needs no configuration for it.

## Checklist

- [ ] Login sets the refresh cookie with `HttpOnly` and `Secure`
- [ ] `SameSite` matches the origin topology
- [ ] Refresh accepts an empty body and reads the cookie
- [ ] CORS names the origin and allows credentials, if cross-origin
- [ ] CSRF cookie readable and its header validated, if enabled
