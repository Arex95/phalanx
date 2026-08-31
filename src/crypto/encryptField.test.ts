import { beforeAll, describe, expect, it } from 'vitest';
import { encryptField } from './encryptField';
import { configEncryption } from '@config/global/encryptionConfig';

function toPem(key: ArrayBuffer): string {
    const base64 = Buffer.from(key).toString('base64');
    const lines = base64.match(/.{1,64}/g) ?? [base64];
    return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----`;
}

describe('encryptField', () => {
    let publicKeyPem: string;
    let privateKey: CryptoKey;

    beforeAll(async () => {
        const keyPair = await crypto.subtle.generateKey(
            { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
            true,
            ['encrypt', 'decrypt']
        );
        privateKey = keyPair.privateKey;
        const exported = await crypto.subtle.exportKey('spki', keyPair.publicKey);
        publicKeyPem = toPem(exported);
        configEncryption({ publicKeyPem });
    });

    function hexToBytes(hex: string): Uint8Array {
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < hex.length; i += 2) {
            bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
        }
        return bytes;
    }

    // The real, end-to-end guarantee this module exists for: what the
    // browser encrypts with the public key, only the backend's matching
    // private key can decrypt — not a mock, an actual RSA-OAEP + AES-GCM
    // round trip against a real generated keypair.
    it('round-trips: what it encrypts, the matching private key decrypts back to the original value', async () => {
        const plaintext = 'super secret value, más de 32 bytes para probar bien';
        const result = await encryptField(plaintext);

        expect(result).toHaveProperty('encryptedKey');
        expect(result).toHaveProperty('iv');
        expect(result).toHaveProperty('ciphertext');

        const rawAesKey = await crypto.subtle.decrypt(
            { name: 'RSA-OAEP' },
            privateKey,
            hexToBytes(result.encryptedKey)
        );
        const aesKey = await crypto.subtle.importKey('raw', rawAesKey, { name: 'AES-GCM' }, false, ['decrypt']);
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: hexToBytes(result.iv) },
            aesKey,
            hexToBytes(result.ciphertext)
        );

        expect(new TextDecoder().decode(decrypted)).toBe(plaintext);
    });

    it('uses a fresh AES key and IV on every call — two calls never produce the same ciphertext for the same value', async () => {
        const a = await encryptField('same value');
        const b = await encryptField('same value');

        expect(a.iv).not.toBe(b.iv);
        expect(a.ciphertext).not.toBe(b.ciphertext);
        expect(a.encryptedKey).not.toBe(b.encryptedKey);
    });

    it('throws a clear error when no public key has been configured', async () => {
        configEncryption({ publicKeyPem: '' });
        // Force the "unconfigured" path back by resetting the module state
        // isn't exposed, so this documents the intended failure instead:
        // an empty PEM fails key import, not silently.
        await expect(encryptField('x')).rejects.toThrow();
        configEncryption({ publicKeyPem });
    });

    describe('base64 decoding fallback', () => {
    // `getPublicKey()` caches the imported CryptoKey against the exact PEM
    // string — reusing the same PEM as earlier tests would hit that cache
    // and skip `base64ToBytes` entirely. Appending a harmless trailing
    // newline changes the cache key without changing the decoded bytes
    // (`pemToBytes` strips whitespace before decoding), forcing a real,
    // fresh decode for each of these.

    it('falls back to Buffer when atob is unavailable', async () => {
        configEncryption({ publicKeyPem: publicKeyPem + '\n' });
        const original = globalThis.atob;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately removing a global to exercise the fallback branch
        delete (globalThis as any).atob;
        try {
            const result = await encryptField('value decoded via the Buffer fallback path');
            expect(result.ciphertext.length).toBeGreaterThan(0);
        } finally {
            globalThis.atob = original;
            configEncryption({ publicKeyPem });
        }
    });

    it('throws a clear error when neither atob nor Buffer is available', async () => {
        configEncryption({ publicKeyPem: publicKeyPem + '\n\n' });
        const originalAtob = globalThis.atob;
        const originalBuffer = globalThis.Buffer;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately removing globals to exercise the "no decoder" branch
        delete (globalThis as any).atob;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (globalThis as any).Buffer;
        try {
            await expect(encryptField('x')).rejects.toThrow(/No base64 decoder available/);
        } finally {
            globalThis.atob = originalAtob;
            globalThis.Buffer = originalBuffer;
            configEncryption({ publicKeyPem });
        }
    });
    });
});
