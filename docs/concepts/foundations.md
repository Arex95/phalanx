# Foundations

The security model, the session handling and the resilience patterns in this
library follow published standards. This page links them, so a reader can check
the source rather than take the documentation's word for it.

## The problem is measured, not assumed

Internal tools are not a side activity that a framework is inventing a market
for. Retool's developer survey has put a number on it for years: respondents
report spending **roughly a third of their time building internal,
employee-facing applications** — 34% in [2021][r21], 33% in [2022][r22], rising
to **45% at companies above 5,000 employees**.

The same survey reports that only **13% of developers use an
admin-specific framework** for that work. The other 87% assemble the layer by
hand, per project.

That gap is the entire argument for this library. It is not that admin panels
are hard; it is that the same layer gets rebuilt, and the parts that get
rebuilt worst are the ones nobody's task list calls out.

[r21]: https://retool.com/blog/state-of-internal-tools-2021
[r22]: https://retool.com/blog/state-of-internal-tools-2022

## The session design follows a standard

[RFC 9700 — Best Current Practice for OAuth 2.0 Security][rfc9700] (IETF, 2025)
is what the session model implements, not a house style:

| RFC 9700 says | Phalanx / the API |
|---|---|
| Refresh tokens for public clients must be sender-constrained **or rotated** | the API rotates on every use |
| Rotate on use, **detect reuse, revoke the family** | implemented server-side |
| Prefer a server session or **`HttpOnly`, `Secure` cookies with appropriate `SameSite`** | exactly the refresh cookie contract |
| Keep access tokens short-lived | held in memory, never persisted |

Where the library stops short of the RFC is worth naming: it does not implement
sender-constrained tokens (mTLS or DPoP). Those need cooperation from the
authorization server and are out of a browser client's reach alone.

[rfc9700]: https://datatracker.ietf.org/doc/html/rfc9700

## Client-side storage has a stated bar, and it is met

The [OWASP HTML5 Security Cheat Sheet][owasp-html5] discourages putting
sensitive data in browser storage, and the
[Web Security Testing Guide][owasp-wstg] gives the reason: anyone who can read
the browser profile directory can read what is there, so client-side storage
provides no confidentiality by itself.

Where encryption is used anyway, the cheat sheet places one condition — the key
must be *"not itself recoverable from the browser… wrapped by a non-extractable
Web Crypto `CryptoKey`"*. [Secure storage](/guide/secure-storage) meets that
condition literally, and states the two threats it does **not** cover.

The [Cryptographic Storage Cheat Sheet][owasp-crypto] supplies the algorithm
choice: *"authenticated modes should always be used… GCM and CCM… as a first
preference"*, and CBC *"does not provide any guarantees about the authenticity
of the data"*. Both encryption features use AES-GCM.

[owasp-html5]: https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html
[owasp-wstg]: https://owasp.org/www-project-web-security-testing-guide/v41/4-Web_Application_Security_Testing/11-Client_Side_Testing/12-Testing_Browser_Storage
[owasp-crypto]: https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html

## The resilience patterns are specified, not invented

**Backoff with jitter.** Both the request retry and the realtime reconnection
randomise their delay, following [AWS's analysis][aws-jitter]: without jitter,
every client that lost the same outage returns on the same tick and the
recovering server takes the whole fleet at once.

**Idempotency keys.** The header
[`Idempotency-Key`][idem] is on the IETF standards track
(`draft-ietf-httpapi-idempotency-key-header`, revision 07, October 2025), which
exists because `POST` and `PATCH` are not idempotent under
[RFC 9110][rfc9110] and a retried write otherwise creates a second record.
[`useIdempotencyKey`](/guide/requests) supplies the client half.

[aws-jitter]: https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
[idem]: https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07
[rfc9110]: https://www.rfc-editor.org/rfc/rfc9110
