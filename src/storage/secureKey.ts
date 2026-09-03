/**
 * The encryption key for `secureStorage`.
 *
 * Generated once, at random, and persisted in IndexedDB as a **non-extractable**
 * `CryptoKey`. The browser uses it to encrypt and decrypt and refuses to export
 * its bytes, which is the condition OWASP places on encrypting anything
 * client-side: the key must not be recoverable from the browser.
 *
 * The consequence worth stating: there is no secret for the application to
 * configure, rotate or leak. The previous design took a string from the bundle,
 * which met none of that.
 */

const DB_NAME = 'phalanx-secure-storage';
const DB_VERSION = 1;
const STORE = 'keys';
const KEY_ID = 'default';

let cached: Promise<CryptoKey> | null = null;

function subtle(): SubtleCrypto {
    const webCrypto = globalThis.crypto;
    if (!webCrypto?.subtle) {
        throw new Error(
            '[phalanx] Web Crypto (crypto.subtle) is not available. Secure storage requires a ' +
                'secure context — https, or localhost.'
        );
    }
    return webCrypto.subtle;
}

function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('[phalanx] IndexedDB is not available in this runtime.'));
            return;
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(STORE)) {
                request.result.createObjectStore(STORE);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
            reject(request.error ?? new Error('[phalanx] IndexedDB open failed.'));
    });
}

function readKey(db: IDBDatabase): Promise<CryptoKey | null> {
    return new Promise((resolve, reject) => {
        const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY_ID);
        request.onsuccess = () => resolve((request.result as CryptoKey | undefined) ?? null);
        request.onerror = () => reject(request.error);
    });
}

function writeKey(db: IDBDatabase, key: CryptoKey): Promise<void> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(key, KEY_ID);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

/**
 * The key for this origin, creating it on first use.
 *
 * Concurrent callers share one promise, so two components starting at once do
 * not race to generate two keys and leave the loser's data unreadable.
 */
export function getSecureStorageKey(): Promise<CryptoKey> {
    if (cached) return cached;

    const pending = (async () => {
        const db = await openDatabase();
        try {
            const existing = await readKey(db);
            if (existing) return existing;

            const key = await subtle().generateKey({ name: 'AES-GCM', length: 256 }, false, [
                'encrypt',
                'decrypt'
            ]);
            await writeKey(db, key);
            return key;
        } finally {
            db.close();
        }
    })().catch((error) => {
        // Do not cache a rejection: a transient IndexedDB failure would
        // otherwise disable secure storage for the life of the page.
        if (cached === pending) cached = null;
        throw error;
    });

    cached = pending;
    return pending;
}

/**
 * Deletes the key, making everything stored with it unreadable.
 *
 * The intended use is signing out on a shared machine: the ciphertext may
 * survive in storage, and without the key it is noise.
 */
export async function destroySecureStorageKey(): Promise<void> {
    cached = null;
    const db = await openDatabase();
    try {
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).delete(KEY_ID);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } finally {
        db.close();
    }
}

/** Test seam: drops the in-memory handle without touching IndexedDB. */
export function resetSecureStorageKeyCache(): void {
    cached = null;
}
