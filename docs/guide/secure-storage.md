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

| Threat | Protected |
|---|---|
| Someone with the device, or a copy of the browser profile | ✅ |
| A browser backup or profile sync | ✅ |
| Anyone opening DevTools → Application | ✅ |
| A modified value being read back as if it were genuine | ✅ |
| **XSS running in the page** | ❌ |

The last row is the one that matters. Script running in your page can call
`getSecureItem` exactly as your own code does. This protects **stored bytes at
rest**, not a compromised page.

That is a different threat from the one session tokens face, where the attacker
*is* the injected script — which is why tokens are not kept here, or anywhere
else on disk. See [Session handling](/concepts/session).

::: tip Where the bar comes from
[OWASP][owasp] permits client-side encryption of stored data only when the key
is *"not itself recoverable from the browser… wrapped by a non-extractable Web
Crypto `CryptoKey`"*. That is what this is.
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
