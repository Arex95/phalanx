# Secure storage

An admin panel often keeps user data in the browser — a draft, a filter, the
last record someone opened. `secureStorage` encrypts it first, so the stored
bytes are not readable by anyone who reaches them.

```ts
import { setSecureItem, getSecureItem, removeSecureItem } from '@arex95/phalanx';

await setSecureItem('draft:patient-42', JSON.stringify(form));

const raw = await getSecureItem('draft:patient-42');
const form = raw ? JSON.parse(raw) : null;

removeSecureItem('draft:patient-42');
```

There is no key to configure. The library generates one on first use and keeps
it as a non-extractable `CryptoKey` in IndexedDB.

## What it protects, and what it does not

| Threat | |
|---|---|
| Anyone looking at storage — DevTools → Application, a copied `localStorage` file | ✅ ciphertext only |
| A value modified in storage being read back as genuine | ✅ AES-GCM rejects it |
| A script exfiltrating the key to use elsewhere | ✅ the key cannot be exported |
| Someone with the **whole** browser profile and knowledge of its internals | ⚠️ limited — the key is on disk too |
| **XSS running in the page** | ❌ it can call `getSecureItem` |

Two rows deserve reading twice.

**XSS.** Script running in your page calls `getSecureItem` exactly as your own
code does. This protects stored bytes, not a compromised page.

**A full profile copy.** `extractable: false` is enforced by the Web Crypto
layer, not by hardware or an OS keychain: the key still lives on disk in the
browser's own storage. It stops any code in the page from exporting it; it does
not stop someone who has the whole profile and is willing to dig into browser
internals. On Firefox the margin is thinner still, since its NSS backend
requires that what goes into IndexedDB be exportable underneath.

What this buys over plaintext is nonetheless the difference between "readable by
anyone who opens the file" and "requires attacking the browser itself".

That is a different threat from the one session tokens face, where the attacker
*is* the injected script — which is why tokens are not kept here, or anywhere
else on disk. See [Session handling](/concepts/session).

::: tip Where the bar comes from
[OWASP][owasp] permits client-side encryption of stored data only when the key
is *"not itself recoverable from the browser… wrapped by a non-extractable Web
Crypto `CryptoKey`"*. This meets that bar, which is the highest one a browser
offers without asking the user for a passphrase on every visit.

For data where a full profile copy is in the threat model, the answer is not a
better browser key — it is not keeping the data in the browser.
:::

[owasp]: https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html

## Storage areas

```ts
await setSecureItem('draft', value, 'session');   // cleared when the tab closes
await setSecureItem('prefs', value, 'local');     // default, survives a restart
```

## Tampering

AES-GCM is authenticated. A value that was modified in storage fails to decrypt
rather than returning plausible garbage, and `getSecureItem` reports `null` —
the same as a miss, because either way there is nothing usable.

## Signing out on a shared machine

```ts
import { destroySecureStorageKey } from '@arex95/phalanx';

await logout();
await destroySecureStorageKey();
```

Deleting the key makes everything written with it unreadable, including whatever
is left in storage. The next write generates a new one.

## Requirements

A secure context — `https`, or `localhost` — for Web Crypto, and IndexedDB for
the key. Both throw a named error where they are unavailable rather than
falling back to storing plaintext.

## What changed from v5

`storeEncryptedItem` and `getDecryptedItem` are gone, along with the `appKey`
they took. They used AES-CBC, which is unauthenticated, derived the key from a
string with a plain SHA-256, and that string shipped in the application bundle —
so the key was recoverable from the browser, which is the one condition the
guidance places on doing this at all.

```diff
-await storeEncryptedItem('draft', value, appKey, 'local');
-const draft = await getDecryptedItem('draft', appKey, 'local');
+await setSecureItem('draft', value);
+const draft = await getSecureItem('draft');
```

The `LocationPreference` type is replaced by `'local' | 'session'`. Cookies are
no longer a target: a cookie written from JavaScript is readable from
JavaScript and travels on every request to its domain, which is the wrong shape
for data the page merely wants to remember.
