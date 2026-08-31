# Backend contract

Phalanx cannot hold up its half of the auth model alone. `HttpOnly` cookies can
only be set by a server, which means the following is not optional — without
it, the refresh cycle does not close.

## 1 · Login sets the refresh cookie

`POST /auth/login` returns the access token in the body, and the refresh token
**only** as a cookie:

```http
HTTP/1.1 200 OK
Set-Cookie: refresh_token=…; HttpOnly; Secure; SameSite=None; Path=/auth/refresh
Content-Type: application/json

{ "data": { "access_token": "eyJ…" } }
```

| Attribute | Why |
|---|---|
| `HttpOnly` | the entire point — script must not read it |
| `Secure` | required by browsers whenever `SameSite=None` |
| `SameSite` | `None` if the API is on another origin, `Lax` if same-site |
| `Path` | narrow it to the refresh route so it is not attached everywhere |

**Do not also return the refresh token in the JSON body.** A token in the body
is a token in memory, in logs, and in whatever the client does with it — the
cookie stops being a boundary the moment there is a second copy.

## 2 · Refresh reads the cookie, not the body

`POST /auth/refresh` arrives with **no body**. The refresh token is in the
cookie the browser attached. Respond with a new access token, and rotate the
refresh cookie.

## 3 · CORS, if the API is on another origin

An admin on `admin.example.com` calling `api.example.com` is cross-origin, and
cookies do not cross by default:

```http
Access-Control-Allow-Origin: https://admin.example.com
Access-Control-Allow-Credentials: true
```

`Allow-Origin` must name the origin explicitly. **`*` is rejected by browsers
when credentials are involved**, and the failure is silent from the client's
side: the request simply arrives without the cookie. The client must set
`withCredentials: true`, which Phalanx does when you pass it.

This is the single most common reason this setup "does not work" — and nothing
in the console says "your cookie was dropped".

## 4 · CSRF, if you enable it

Set a **readable** CSRF cookie (no `HttpOnly`) and validate the mirrored header
on refresh and logout:

```http
Set-Cookie: XSRF-TOKEN=…; Secure; SameSite=None; Path=/
```

## 5 · Rotation and reuse detection

Recommended, not required by the client: issue a new refresh token on every
refresh, and if a token is ever presented twice, invalidate the whole family.
Reuse means the token leaked, and reuse detection is the only way a stateless
scheme finds out.

## Checklist

- [ ] Login sets `HttpOnly` + `Secure` refresh cookie
- [ ] Login does **not** return the refresh token in the body
- [ ] Refresh accepts an empty body and reads the cookie
- [ ] `SameSite` matches your origin topology
- [ ] CORS names the origin and allows credentials
- [ ] CSRF cookie is readable and its header is validated
- [ ] Refresh rotates, and reuse invalidates the family
