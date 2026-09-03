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
      '[phalanx] Web Crypto API (crypto.subtle) is not available. ' +
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
