import { getSecureStorageKey } from './secureKey';

/**
 * Encrypted storage for user data the panel keeps in the browser.
 *
 * ## What it protects, and what it does not
 *
 * | Threat | Protected |
 * |---|---|
 * | Someone with the device, or a copy of the browser profile | yes |
 * | A browser backup or profile sync | yes |
 * | Anyone opening DevTools → Application | yes |
 * | **XSS running in the page** | **no** |
 *
 * The last row is the one to remember. Script running in your page can call
 * these functions exactly as your own code does, so this defends the stored
 * bytes at rest, not the running page. That is a different threat from the one
 * session tokens face — which is why tokens are not kept here, or anywhere else
 * on disk.
 *
 * The key is a non-extractable `CryptoKey` in IndexedDB: the browser will use
 * it but never hand over its bytes, and the application has no secret to
 * configure.
 */

const IV_BYTES = 12; // 96 bits, the size AES-GCM is specified for

export type SecureStorageArea = 'local' | 'session';

function area(name: SecureStorageArea): Storage | null {
    try {
        return name === 'session' ? globalThis.sessionStorage : globalThis.localStorage;
    } catch {
        // Private mode and storage-blocking browsers throw on access.
        return null;
    }
}

function toBase64(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

/**
 * Encrypts `value` and writes it under `key`.
 *
 * The IV is random per write and stored alongside the ciphertext — it is not a
 * secret, and reusing one with the same key would break AES-GCM outright.
 */
export async function setSecureItem(
    key: string,
    value: string,
    storageArea: SecureStorageArea = 'local'
): Promise<void> {
    const storage = area(storageArea);
    if (!storage) return;

    const cryptoKey = await getSecureStorageKey();
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const ciphertext = await globalThis.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        cryptoKey,
        new TextEncoder().encode(value)
    );

    storage.setItem(key, `${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`);
}

/**
 * Reads and decrypts `key`, or `null` when it is absent, unreadable or was
 * tampered with.
 *
 * AES-GCM is authenticated, so a modified ciphertext fails to decrypt rather
 * than returning plausible garbage. That failure is reported as `null`, the
 * same as a miss: from the caller's side there is nothing usable either way.
 */
export async function getSecureItem(
    key: string,
    storageArea: SecureStorageArea = 'local'
): Promise<string | null> {
    const storage = area(storageArea);
    const stored = storage?.getItem(key);
    if (!stored) return null;

    const separator = stored.indexOf('.');
    if (separator === -1) return null;

    try {
        const iv = fromBase64(stored.slice(0, separator));
        const ciphertext = fromBase64(stored.slice(separator + 1));
        const cryptoKey = await getSecureStorageKey();

        const plaintext = await globalThis.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            cryptoKey,
            ciphertext
        );
        return new TextDecoder().decode(plaintext);
    } catch {
        return null;
    }
}

/** Removes the entry. */
export function removeSecureItem(key: string, storageArea: SecureStorageArea = 'local'): void {
    area(storageArea)?.removeItem(key);
}
