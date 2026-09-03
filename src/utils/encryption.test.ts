import { describe, expect, it, vi } from 'vitest';
import { ab2hex, getWebCrypto } from './encryption';

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
