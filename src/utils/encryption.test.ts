import { afterEach, describe, expect, it, vi } from 'vitest';
import { ab2hex, decrypt, encrypt, getWebCrypto, hex2ab, importKey } from './encryption';

describe('getWebCrypto', () => {
    it('returns the real Web Crypto API when available', () => {
        expect(getWebCrypto()).toBe(globalThis.crypto);
    });

    it('throws a descriptive error when crypto.subtle is unavailable', () => {
        vi.stubGlobal('crypto', {});
        expect(() => getWebCrypto()).toThrow(/Web Crypto API/);
        vi.unstubAllGlobals();
    });
});

describe('ab2hex', () => {
    it('converts bytes to a lowercase, zero-padded hex string', () => {
        expect(ab2hex(new Uint8Array([0, 1, 255, 16]))).toBe('0001ff10');
    });

    it('returns an empty string for an empty buffer', () => {
        expect(ab2hex(new Uint8Array([]))).toBe('');
    });

    it('accepts a raw ArrayBuffer, not just a Uint8Array', () => {
        const buffer = new Uint8Array([10, 20]).buffer;
        expect(ab2hex(buffer)).toBe('0a14');
    });
});

describe('hex2ab', () => {
    it('is the exact inverse of ab2hex', () => {
        const bytes = new Uint8Array([0, 1, 255, 16, 128]);
        expect(hex2ab(ab2hex(bytes))).toEqual(bytes);
    });

    it('returns an empty Uint8Array for an empty string', () => {
        expect(hex2ab('')).toEqual(new Uint8Array([]));
    });

    it('throws for a non-string input', () => {
        // @ts-expect-error - intentionally passing the wrong type
        expect(() => hex2ab(123)).toThrow(TypeError);
    });

    it('throws for an odd-length hex string', () => {
        expect(() => hex2ab('abc')).toThrow(/Invalid hexadecimal/);
    });

    it('throws for a string containing non-hex characters', () => {
        expect(() => hex2ab('zz')).toThrow(/Invalid hexadecimal/);
    });
});

describe('importKey', () => {
    it('throws for an empty secret key', async () => {
        await expect(importKey('')).rejects.toThrow(/Secret key cannot be null or empty/);
    });

    it('derives a usable AES-CBC CryptoKey from a secret string', async () => {
        const key = await importKey('some-secret');
        expect(key.algorithm.name).toBe('AES-CBC');
        expect(key.usages).toEqual(['encrypt', 'decrypt']);
    });
});

describe('encrypt/decrypt round trip', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('decrypts exactly what was encrypted with the same key', async () => {
        const plaintext = 'hello, this is a secret value with some length';
        const encrypted = await encrypt(plaintext, 'my-key');
        const decrypted = await decrypt(encrypted, 'my-key');
        expect(decrypted).toBe(plaintext);
    });

    it('produces a different ciphertext (and IV) on every call for the same input', async () => {
        const a = await encrypt('same value', 'key');
        const b = await encrypt('same value', 'key');
        expect(a).not.toBe(b);
        expect(a.substring(0, 32)).not.toBe(b.substring(0, 32)); // IV
    });

    it('fails to decrypt with the wrong key', async () => {
        const encrypted = await encrypt('secret', 'key-a');
        await expect(decrypt(encrypted, 'key-b')).rejects.toThrow();
    });

    it('rejects an empty encrypted value', async () => {
        await expect(decrypt('', 'key')).rejects.toThrow(/cannot be null or empty/);
    });

    it('rejects a value shorter than the IV length', async () => {
        await expect(decrypt('abcd', 'key')).rejects.toThrow(/too short/);
    });

    it('rejects a value that is only the IV, no ciphertext', async () => {
        const ivOnly = '0'.repeat(32);
        await expect(decrypt(ivOnly, 'key')).rejects.toThrow(/Ciphertext is empty/);
    });

    it('rejects tampered ciphertext (fails AES-CBC integrity implicitly via decode/authentication)', async () => {
        const encrypted = await encrypt('secret value', 'key');
        // Flip a hex character in the ciphertext portion.
        const tampered = encrypted.substring(0, 32) + '00' + encrypted.substring(34);
        // AES-CBC has no built-in authentication, so this may not always
        // throw — but if it doesn't, the output must differ from the
        // original plaintext, never silently return the right value.
        try {
            const result = await decrypt(tampered, 'key');
            expect(result).not.toBe('secret value');
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });
});
