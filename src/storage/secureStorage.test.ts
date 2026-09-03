import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    destroySecureStorageKey,
    getSecureItem,
    getSecureStorageKey,
    removeSecureItem,
    resetSecureStorageKeyCache,
    setSecureItem
} from './index';

describe('secure storage', () => {
    beforeEach(async () => {
        localStorage.clear();
        sessionStorage.clear();
        resetSecureStorageKeyCache();
        await destroySecureStorageKey();
        resetSecureStorageKeyCache();
    });

    it('round-trips a value', async () => {
        await setSecureItem('patient', 'Ada Lovelace');
        expect(await getSecureItem('patient')).toBe('Ada Lovelace');
    });

    it('does not leave the plaintext in storage', async () => {
        await setSecureItem('patient', 'Ada Lovelace');
        const raw = localStorage.getItem('patient')!;
        expect(raw).not.toContain('Ada');
        expect(raw).not.toContain('Lovelace');
    });

    it('returns null for a key that was never set', async () => {
        expect(await getSecureItem('missing')).toBeNull();
    });

    it('keeps the two storage areas apart', async () => {
        await setSecureItem('draft', 'local copy', 'local');
        await setSecureItem('draft', 'session copy', 'session');

        expect(await getSecureItem('draft', 'local')).toBe('local copy');
        expect(await getSecureItem('draft', 'session')).toBe('session copy');
    });

    it('removes an entry', async () => {
        await setSecureItem('patient', 'Ada');
        removeSecureItem('patient');
        expect(await getSecureItem('patient')).toBeNull();
    });

    it('uses a fresh IV per write, so the same value never repeats a ciphertext', async () => {
        await setSecureItem('a', 'same value');
        const first = localStorage.getItem('a');
        await setSecureItem('a', 'same value');
        const second = localStorage.getItem('a');

        expect(second).not.toBe(first);
        expect(await getSecureItem('a')).toBe('same value');
    });

    it('round-trips unicode and long values', async () => {
        const value = `年 — ñ — 🔐 ${'x'.repeat(5_000)}`;
        await setSecureItem('unicode', value);
        expect(await getSecureItem('unicode')).toBe(value);
    });

    it('round-trips an empty string', async () => {
        await setSecureItem('empty', '');
        expect(await getSecureItem('empty')).toBe('');
    });
});

describe('tampering', () => {
    beforeEach(async () => {
        localStorage.clear();
        resetSecureStorageKeyCache();
        await destroySecureStorageKey();
        resetSecureStorageKeyCache();
    });

    it('returns null when the ciphertext was modified', async () => {
        await setSecureItem('patient', 'Ada Lovelace');
        const stored = localStorage.getItem('patient')!;
        const [iv, ciphertext] = stored.split('.');

        // flip one character of the ciphertext
        const flipped = ciphertext[0] === 'A' ? `B${ciphertext.slice(1)}` : `A${ciphertext.slice(1)}`;
        localStorage.setItem('patient', `${iv}.${flipped}`);

        // AES-GCM is authenticated: this fails to decrypt rather than
        // returning plausible garbage, which AES-CBC would have done.
        expect(await getSecureItem('patient')).toBeNull();
    });

    it('returns null when the IV was modified', async () => {
        await setSecureItem('patient', 'Ada Lovelace');
        const [, ciphertext] = localStorage.getItem('patient')!.split('.');
        localStorage.setItem('patient', `AAAAAAAAAAAAAAAA.${ciphertext}`);

        expect(await getSecureItem('patient')).toBeNull();
    });

    it('returns null for a value that is not in the stored format', async () => {
        localStorage.setItem('patient', 'just some text');
        expect(await getSecureItem('patient')).toBeNull();
    });

    it('returns null for a value with the separator but invalid base64', async () => {
        localStorage.setItem('patient', '!!!.???');
        expect(await getSecureItem('patient')).toBeNull();
    });
});

describe('the key', () => {
    beforeEach(async () => {
        localStorage.clear();
        resetSecureStorageKeyCache();
        await destroySecureStorageKey();
        resetSecureStorageKeyCache();
    });

    it('is not extractable', async () => {
        const key = await getSecureStorageKey();
        expect(key.extractable).toBe(false);
        await expect(globalThis.crypto.subtle.exportKey('raw', key)).rejects.toThrow();
    });

    it('is AES-GCM at 256 bits', async () => {
        const key = await getSecureStorageKey();
        expect(key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
        expect(key.usages.sort()).toEqual(['decrypt', 'encrypt']);
    });

    it('is the same key across calls, so data written earlier stays readable', async () => {
        await setSecureItem('patient', 'Ada');
        resetSecureStorageKeyCache(); // as if the page reloaded
        expect(await getSecureItem('patient')).toBe('Ada');
    });

    it('is generated once under concurrent callers', async () => {
        const generate = vi.spyOn(globalThis.crypto.subtle, 'generateKey');
        const keys = await Promise.all([
            getSecureStorageKey(),
            getSecureStorageKey(),
            getSecureStorageKey()
        ]);

        expect(generate).toHaveBeenCalledTimes(1);
        expect(keys[0]).toBe(keys[1]);
        expect(keys[1]).toBe(keys[2]);
        generate.mockRestore();
    });

    it('destroying it makes everything written with it unreadable', async () => {
        await setSecureItem('patient', 'Ada Lovelace');
        expect(localStorage.getItem('patient')).not.toBeNull();

        await destroySecureStorageKey();

        // the ciphertext survives, the plaintext does not
        expect(localStorage.getItem('patient')).not.toBeNull();
        expect(await getSecureItem('patient')).toBeNull();
    });

    it('does not cache a failure, so a transient error is recoverable', async () => {
        const generate = vi
            .spyOn(globalThis.crypto.subtle, 'generateKey')
            .mockRejectedValueOnce(new Error('transient'));

        await expect(getSecureStorageKey()).rejects.toThrow('transient');
        generate.mockRestore();

        await expect(getSecureStorageKey()).resolves.toBeDefined();
    });
});

describe('unavailable runtimes', () => {
    beforeEach(() => {
        resetSecureStorageKeyCache();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        resetSecureStorageKeyCache();
    });

    it('names Web Crypto when crypto.subtle is missing', async () => {
        // An admin served over plain http on an intranet: the page runs, and
        // `crypto.subtle` is simply absent. The error has to say why.
        vi.stubGlobal('crypto', {});

        await expect(getSecureStorageKey()).rejects.toThrow(/Web Crypto/);
        await expect(getSecureStorageKey()).rejects.toThrow(/secure context/);
    });

    it('names IndexedDB when it is missing', async () => {
        vi.stubGlobal('indexedDB', undefined);

        await expect(getSecureStorageKey()).rejects.toThrow(/IndexedDB is not available/);
    });

    it('reports a failure to open the database', async () => {
        vi.stubGlobal('indexedDB', {
            open: () => {
                const request: Record<string, unknown> = { error: new Error('quota exceeded') };
                queueMicrotask(() => (request.onerror as () => void)?.());
                return request;
            }
        });

        await expect(getSecureStorageKey()).rejects.toThrow('quota exceeded');
    });

    it('falls back to a named error when the request carries none', async () => {
        vi.stubGlobal('indexedDB', {
            open: () => {
                const request: Record<string, unknown> = { error: null };
                queueMicrotask(() => (request.onerror as () => void)?.());
                return request;
            }
        });

        await expect(getSecureStorageKey()).rejects.toThrow(/IndexedDB open failed/);
    });

    it('a write is a no-op rather than a plaintext fallback when storage is blocked', async () => {
        // Replacing the object, not spying on Storage.prototype: happy-dom's
        // storage does not go through that prototype, so a spy there applies
        // to nothing and the test passes without exercising anything.
        const blocked = {
            getItem: () => {
                throw new Error('blocked');
            },
            setItem: () => {
                throw new Error('blocked');
            },
            removeItem: () => {
                throw new Error('blocked');
            }
        };
        vi.stubGlobal('localStorage', blocked);

        // The failure that matters: never fall back to storing it in the clear.
        await expect(setSecureItem('patient', 'Ada')).resolves.toBeUndefined();
        expect(await getSecureItem('patient')).toBeNull();
        expect(() => removeSecureItem('patient')).not.toThrow();
    });
});
