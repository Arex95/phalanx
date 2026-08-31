/**
 * Returns the Web Crypto API instance, validating availability.
 *
 * Compatible with:
 *   - Modern browsers        (window.crypto.subtle)
 *   - Node.js 15+            (globalThis.crypto.subtle — built-in Web Crypto API)
 *   - Nitro / Deno / Workers (globalThis.crypto.subtle)
 *
 * Throws a descriptive error on Node.js < 15 instead of failing silently.
 */
export function getWebCrypto(): Crypto {
  const c =
    typeof globalThis !== 'undefined'
      ? globalThis.crypto
      : typeof crypto !== 'undefined'
      ? crypto
      : undefined;

  if (!c?.subtle) {
    throw new Error(
      '[arex-core] Web Crypto API (crypto.subtle) is not available. ' +
      'Requires Node.js 15+, a modern browser, or a runtime that exposes globalThis.crypto.subtle.'
    );
  }
  return c as Crypto;
}

/**
 * Converts an `ArrayBuffer` or `Uint8Array` into a hexadecimal string.
 */
export function ab2hex(buffer: ArrayBuffer | Uint8Array): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Converts a hexadecimal string into a `Uint8Array`.
 */
export function hex2ab(hex: string): Uint8Array<ArrayBuffer> {
  if (typeof hex !== 'string') {
    throw new TypeError('Input must be a string.');
  }
  if (hex.length === 0) {
    return new Uint8Array();
  }
  if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length % 2 !== 0) {
    throw new Error('Invalid hexadecimal string format or odd length.');
  }
  const array = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    array[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return array;
}

/**
 * Derives a CryptoKey for AES-CBC-256 from a plain-text secret using SHA-256.
 *
 * @throws {Error} If secretKey is empty or Web Crypto API is unavailable.
 */
export async function importKey(secretKey: string): Promise<CryptoKey> {
  if (!secretKey) {
    throw new Error('Secret key cannot be null or empty.');
  }
  const wc = getWebCrypto();
  const keyMaterial = new TextEncoder().encode(secretKey);
  const digest = await wc.subtle.digest('SHA-256', keyMaterial);
  return wc.subtle.importKey(
    'raw',
    digest,
    { name: 'AES-CBC', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a plain-text string using AES-CBC-256.
 * A unique 16-byte IV is generated per call.
 * Output format: IV_hex (32 chars) + ciphertext_hex.
 */
export async function encrypt(value: string, secretKey: string): Promise<string> {
  const wc = getWebCrypto();
  const key = await importKey(secretKey);
  const iv = wc.getRandomValues(new Uint8Array(16));
  const encodedValue = new TextEncoder().encode(value);

  const ciphertext = await wc.subtle.encrypt(
    { name: 'AES-CBC', iv },
    key,
    encodedValue
  );

  return ab2hex(iv) + ab2hex(new Uint8Array(ciphertext));
}

/**
 * Decrypts a hex string (IV_hex + ciphertext_hex) produced by `encrypt()`.
 */
export async function decrypt(encryptedValue: string, secretKey: string): Promise<string> {
  if (!encryptedValue) {
    throw new Error('Encrypted value cannot be null or empty.');
  }
  if (encryptedValue.length < 32) {
    throw new Error('Encrypted value is too short. Expected at least 32 hex chars for the IV.');
  }

  const wc = getWebCrypto();
  const key = await importKey(secretKey);

  const iv = hex2ab(encryptedValue.substring(0, 32));
  const ciphertext = hex2ab(encryptedValue.substring(32));

  if (iv.byteLength !== 16) {
    throw new Error(`IV has incorrect length: ${iv.byteLength} bytes. Expected 16.`);
  }
  if (ciphertext.byteLength === 0) {
    throw new Error('Ciphertext is empty. Nothing to decrypt.');
  }

  const decryptedBuffer = await wc.subtle.decrypt(
    { name: 'AES-CBC', iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decryptedBuffer);
}
