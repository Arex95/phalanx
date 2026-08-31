import { getEncryptionPublicKeyPem } from "@config/global/encryptionConfig";
import { getWebCrypto, ab2hex } from "@utils/encryption";
import type { EncryptedField } from "@/types";

/**
 * Client-side field-level encryption (CSFLE) for user data sent to the
 * backend — a distinct concern from auth token storage, and solved with the
 * opposite kind of key. A token has to be *read back* by this same code, so
 * it needs a symmetric key, which can never be safe to ship in a bundle.
 * A value encrypted here never needs to be read back by the frontend — only
 * the backend, holding the matching RSA private key, ever decrypts it — so
 * an asymmetric public key is fine to ship. See the study's §21.4 for the
 * full reasoning.
 *
 * Hybrid (envelope) encryption, not raw RSA: RSA-OAEP has a payload size
 * ceiling far below what a real form field needs, so only a small,
 * newly-generated AES-256-GCM key is ever run through it. The AES key —
 * generated in memory, used once, never persisted — encrypts the actual
 * value; RSA then only has to wrap that small key.
 */

let cachedPublicKey: CryptoKey | null = null;
let cachedPublicKeyPem: string | null = null;

/**
 * `atob` isn't guaranteed globally — `utils/encryption.ts` documents Node
 * 15+ support via `getWebCrypto()`'s runtime detection, and Node didn't get
 * a global `atob` until v16. `Buffer` has been available since Node 4, so
 * it's the fallback rather than a hard requirement on the newer global.
 */
function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  if (typeof Buffer !== 'undefined') {
    // `Buffer.from(...)` types its own `.buffer` as `ArrayBufferLike`
    // (it could in principle be backed by a SharedArrayBuffer) — copying
    // into a plain `new Uint8Array(length)` guarantees a real `ArrayBuffer`
    // backing, which is what `crypto.subtle.importKey`'s `BufferSource`
    // requires under this TS lib version.
    const node = Buffer.from(base64, 'base64');
    const bytes = new Uint8Array(node.length);
    bytes.set(node);
    return bytes;
  }
  throw new Error('[arex-core] No base64 decoder available in this runtime.');
}

function pemToBytes(pem: string): Uint8Array<ArrayBuffer> {
  const base64 = pem
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\s+/g, '');
  return base64ToBytes(base64);
}

async function getPublicKey(): Promise<CryptoKey> {
  const pem = getEncryptionPublicKeyPem();
  if (cachedPublicKey && cachedPublicKeyPem === pem) {
    return cachedPublicKey;
  }
  const wc = getWebCrypto();
  cachedPublicKey = await wc.subtle.importKey(
    'spki',
    pemToBytes(pem),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  );
  cachedPublicKeyPem = pem;
  return cachedPublicKey;
}

/**
 * Encrypts a single value for the backend's private key to decrypt.
 * Result is JSON-safe (hex strings) — drop it straight into a request body.
 */
export async function encryptField(value: string): Promise<EncryptedField> {
  const wc = getWebCrypto();
  const publicKey = await getPublicKey();

  const aesKey = await wc.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
  ]);
  const iv = wc.getRandomValues(new Uint8Array(12));
  const encodedValue = new TextEncoder().encode(value);

  const ciphertext = await wc.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, encodedValue);
  const rawAesKey = await wc.subtle.exportKey('raw', aesKey);
  const encryptedKey = await wc.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, rawAesKey);

  return {
    encryptedKey: ab2hex(encryptedKey),
    iv: ab2hex(iv),
    ciphertext: ab2hex(ciphertext),
  };
}
