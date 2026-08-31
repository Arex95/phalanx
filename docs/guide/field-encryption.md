# Field encryption

`encryptField` encrypts a value in the browser so that only the backend can
read it. It is for outbound user data — a document number, a medical note, a
bank reference — that should not be readable in transit logs, proxies or a
database dump.

::: warning A different problem from tokens
This works for the exact reason client-side token encryption does not. Outbound
data is **never read back** by the client, so the client only needs the public
half of the key. A token has to be decrypted by the code that stores it, which
means the key is in the bundle — and then it protects nothing. See
[The auth model](/concepts/auth-model).
:::

## Configure the public key

```ts
app.use(Phalanx, {
    // …
    encryption: { publicKeyPem: import.meta.env.VITE_ENCRYPTION_PUBLIC_KEY }
});
```

The public key is safe to ship. That is what makes it a public key. The private
half never leaves the backend.

## Encrypt

```ts
import { encryptField } from '@arex95/phalanx';

const payload = {
    name: form.name,
    taxId: await encryptField(form.taxId)
};
```

The result is a JSON-serialisable envelope:

```ts
interface EncryptedField {
    encryptedKey: string;  // the AES key, wrapped with RSA-OAEP
    iv: string;            // the AES-GCM nonce
    ciphertext: string;    // the encrypted value
}
```

## How it works, and why it is hybrid

A fresh **AES-256-GCM** key is generated for every call, used once to encrypt
the value, then wrapped with your **RSA-OAEP** public key and thrown away.

RSA cannot encrypt arbitrary-length data — with a 2048-bit key and OAEP padding
the ceiling is 190 bytes, so a two-line address would fail. Encrypting the data
symmetrically and the *key* asymmetrically is the standard answer, and it is
what your database's own field-level encryption does.

GCM is authenticated: a tampered ciphertext fails to decrypt rather than
decrypting to garbage.

## What the backend does

Unwrap `encryptedKey` with the RSA private key, then decrypt `ciphertext` with
the resulting AES key and `iv`. Every mainstream language has this in its
standard library.

## What this does not protect against

- **A compromised frontend.** Script running in your page can read the value
  before it is encrypted. This protects data *in transit and at rest*, not from
  XSS.
- **The backend itself.** It holds the private key by design.
- **Traffic analysis.** Sizes and timing are unchanged.

It is not a substitute for TLS. It is a second envelope inside it, so that the
value is not readable by anything between the browser and the code holding the
private key.
