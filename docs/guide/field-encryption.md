# Field encryption

`encryptField` encrypts a value in the browser so that only the holder of the
private key can read it — a document number, a medical note, a bank reference
that should not appear in transit logs, proxies or a database dump.

::: tip
The client only ever holds the public key, because it never needs to read the
value back. This is not a substitute for storing credentials — see
[Session handling](/concepts/session).
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

## Scheme

A fresh AES-256-GCM key per call encrypts the value; the key is wrapped with the
RSA-OAEP public key and discarded. RSA-OAEP with a 2048-bit key carries about
190 bytes, so the envelope keeps the payload off the asymmetric side. GCM is
authenticated, so a tampered ciphertext fails to decrypt rather than decrypting
to garbage.

## Decrypting

Unwrap `encryptedKey` with the RSA private key, then decrypt `ciphertext` with
the resulting AES key and `iv`. Both primitives are in the standard library of
every mainstream runtime.

## Scope

The value is protected between the browser and the holder of the private key.
It is not protected from script running in the page, which sees it before
encryption, and sizes and timing are unchanged. This sits inside TLS rather than
replacing it.
