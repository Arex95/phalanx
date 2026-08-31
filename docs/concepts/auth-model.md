# The auth model

## What was there before

Earlier versions encrypted the access token with an application key and put it
in `localStorage`. There was also a `'cookie'` storage mode.

Both were theatre, and it is worth being precise about why:

- **The key shipped in the bundle.** Any attacker who can run JavaScript on the
  page — which is the entire threat model for stored tokens — can read the key
  the same way the legitimate code does. Encrypting a value with a key stored
  next to it is encoding, not encryption.
- **The `'cookie'` mode was `document.cookie`.** A cookie written by JavaScript
  is readable by JavaScript. It was never `HttpOnly`, and `HttpOnly` cannot be
  set from the browser — only a server can set it.

The conclusion is uncomfortable but simple: **a browser cannot keep a secret
from script running in its own page.** No amount of client-side cryptography
changes that, because whatever the client can decrypt, injected script can
decrypt too.

## What replaced it

| | Where it lives | Who can read it |
|---|---|---|
| Access token | a module-level Vue `ref` | page script, until reload |
| Refresh token | an `HttpOnly` cookie set by the backend | the backend only |

The access token is short-lived and never persisted. A page reload loses it —
that is not a bug, it is the mechanism: the app calls refresh, and the
long-lived credential the refresh depends on is one JavaScript never sees.

XSS is still bad. An attacker running in your page can use the in-memory token
for as long as the page is open. What they cannot do is **steal the session**:
they cannot exfiltrate the refresh token, so their access dies with the tab
instead of lasting weeks.

That is the whole trade, and it is the industry consensus for browser clients
that are not behind a backend-for-frontend.

## Why CSRF appears now, and only there

Moving the refresh token into a cookie introduces a risk bearer headers do not
have: browsers attach cookies to cross-site requests automatically. A malicious
page can therefore cause a refresh request to be sent with the victim's cookie.

The defence is Double Submit Cookie, OWASP's recommendation for stateless APIs:
the backend also sets a readable CSRF cookie, and the client mirrors its value
into a request header. An attacker can cause the cookie to be sent but cannot
read it to set the header, because the same-origin policy stops them.

**Scoped deliberately to refresh and logout.** Every other request carries a
bearer header, which a cross-site attacker cannot set. Adding a CSRF header
there would be ceremony without a threat.

## What this model demands from the backend

This is the part no library can implement for you: the cookie must be set by
the server, so half of this design lives in the API. See
[Backend contract](/concepts/backend-contract).
