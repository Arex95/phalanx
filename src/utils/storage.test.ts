import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDecryptedItem, storeEncryptedItem } from './storage';

function clearAllCookies() {
    document.cookie.split(';').forEach((c) => {
        const name = c.split('=')[0]?.trim();
        if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`;
    });
}

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearAllCookies();
});

describe('storeEncryptedItem / getDecryptedItem — client, per location', () => {
    it("'local': round-trips through localStorage only", async () => {
        await storeEncryptedItem('k', 'value', 'secret', 'local');
        expect(localStorage.getItem('k')).not.toBe('value'); // stored encrypted, not plaintext
        expect(sessionStorage.getItem('k')).toBeNull();
        expect(await getDecryptedItem('k', 'secret', 'local')).toBe('value');
    });

    it("'session': round-trips through sessionStorage only", async () => {
        await storeEncryptedItem('k', 'value', 'secret', 'session');
        expect(localStorage.getItem('k')).toBeNull();
        expect(await getDecryptedItem('k', 'secret', 'session')).toBe('value');
    });

    it("'cookie': round-trips through document.cookie only", async () => {
        await storeEncryptedItem('k', 'value', 'secret', 'cookie');
        expect(localStorage.getItem('k')).toBeNull();
        expect(await getDecryptedItem('k', 'secret', 'cookie')).toBe('value');
    });

    it("'any' on write goes to localStorage (not sessionStorage — a documented past bug)", async () => {
        await storeEncryptedItem('k', 'value', 'secret', 'any');
        expect(localStorage.getItem('k')).not.toBeNull();
        expect(sessionStorage.getItem('k')).toBeNull();
    });

    it("'any' on read checks sessionStorage before localStorage before cookies", async () => {
        await storeEncryptedItem('k', 'from-session', 'secret', 'session');
        await storeEncryptedItem('k', 'from-local', 'secret', 'local');
        await storeEncryptedItem('k', 'from-cookie', 'secret', 'cookie');

        expect(await getDecryptedItem('k', 'secret', 'any')).toBe('from-session');
    });

    it("'any' falls back to localStorage when sessionStorage has nothing", async () => {
        await storeEncryptedItem('k', 'from-local', 'secret', 'local');
        await storeEncryptedItem('k', 'from-cookie', 'secret', 'cookie');
        expect(await getDecryptedItem('k', 'secret', 'any')).toBe('from-local');
    });

    it("'any' falls back to cookies as a last resort", async () => {
        await storeEncryptedItem('k', 'from-cookie', 'secret', 'cookie');
        expect(await getDecryptedItem('k', 'secret', 'any')).toBe('from-cookie');
    });

    it("an explicit 'cookie' read does not fall through to other storage", async () => {
        await storeEncryptedItem('k', 'from-local', 'secret', 'local');
        expect(await getDecryptedItem('k', 'secret', 'cookie')).toBeNull();
    });

    it('returns null for a key that was never stored', async () => {
        expect(await getDecryptedItem('missing', 'secret', 'any')).toBeNull();
    });

    it('returns null (not a throw) when decrypting with the wrong key', async () => {
        await storeEncryptedItem('k', 'value', 'right-key', 'local');
        expect(await getDecryptedItem('k', 'wrong-key', 'local')).toBeNull();
    });

    it('accepts custom cookie options without throwing', async () => {
        // `path: '/app'` is deliberately not exercised here: happy-dom
        // scopes cookie visibility to the document's actual location, and
        // a plain `document.cookie` read (no path argument) wouldn't see a
        // cookie written under a different path — a test-environment
        // detail, not something this function controls.
        await expect(
            storeEncryptedItem('k', 'value', 'secret', 'cookie', { sameSite: 'Strict' })
        ).resolves.toBeUndefined();
        expect(await getDecryptedItem('k', 'secret', 'cookie')).toBe('value');
    });
});

describe('storeEncryptedItem / getDecryptedItem — SSR (no window)', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    it('write is a silent no-op server-side (cookie storage no-ops without document)', async () => {
        vi.resetModules();
        vi.stubGlobal('window', undefined);
        const mod = await import('./storage');
        await expect(mod.storeEncryptedItem('k', 'value', 'secret', 'local')).resolves.toBeUndefined();
    });

    it('read returns null server-side regardless of location', async () => {
        vi.resetModules();
        vi.stubGlobal('window', undefined);
        const mod = await import('./storage');
        expect(await mod.getDecryptedItem('k', 'secret', 'local')).toBeNull();
        expect(await mod.getDecryptedItem('k', 'secret', 'any')).toBeNull();
    });
});
