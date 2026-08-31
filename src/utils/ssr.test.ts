import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCookieStorage, getPreferredStorage, getSessionStorage, getStorage, isClient, isServer } from './ssr';

describe('isServer/isClient (client environment)', () => {
    it('reports client in a browser-like (happy-dom) environment', () => {
        expect(isServer).toBe(false);
        expect(isClient).toBe(true);
    });
});

describe('getStorage/getSessionStorage (client)', () => {
    it('returns the real localStorage/sessionStorage', () => {
        expect(getStorage()).toBe(window.localStorage);
        expect(getSessionStorage()).toBe(window.sessionStorage);
    });
});

describe('getCookieStorage', () => {
    beforeEach(() => {
        document.cookie.split(';').forEach((c) => {
            const name = c.split('=')[0]?.trim();
            if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`;
        });
    });

    it('returns null for a cookie that does not exist', () => {
        expect(getCookieStorage().getItem('nope')).toBeNull();
    });

    it('sets and reads back a cookie', () => {
        getCookieStorage().setItem('greeting', 'hello world');
        expect(getCookieStorage().getItem('greeting')).toBe('hello world');
    });

    it('URL-encodes the value on write and decodes it on read', () => {
        getCookieStorage().setItem('special', 'a=b&c d');
        expect(getCookieStorage().getItem('special')).toBe('a=b&c d');
    });

    it('splits on the FIRST "=" only — a value containing "=" survives intact', () => {
        // Regression guard: naive `split('=')` would truncate a base64/hex
        // value at its own internal '=' padding.
        getCookieStorage().setItem('token', 'YWJj===padding');
        expect(getCookieStorage().getItem('token')).toBe('YWJj===padding');
    });

    it('finds the right cookie among several set at once', () => {
        getCookieStorage().setItem('a', '1');
        getCookieStorage().setItem('b', '2');
        expect(getCookieStorage().getItem('a')).toBe('1');
        expect(getCookieStorage().getItem('b')).toBe('2');
    });

    it('removeItem clears a previously-set cookie', () => {
        getCookieStorage().setItem('temp', 'x');
        expect(getCookieStorage().getItem('temp')).toBe('x');
        getCookieStorage().removeItem('temp');
        expect(getCookieStorage().getItem('temp')).toBeNull();
    });

    it('throws when asked to set httpOnly — that can never work from JS', () => {
        expect(() => getCookieStorage().setItem('x', 'y', { httpOnly: true })).toThrow(
            /HttpOnly cookies cannot be set from JavaScript/
        );
    });

    it('does not throw for a normal set without httpOnly', () => {
        expect(() => getCookieStorage().setItem('x', 'y')).not.toThrow();
    });
});

describe('getPreferredStorage (client)', () => {
    it('prefers real Storage over cookies when available', () => {
        expect(getPreferredStorage()).toBe(window.localStorage);
    });
});

describe('SSR environment (no window)', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.stubGlobal('window', undefined);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('isServer is true and isClient is false when window is undefined', async () => {
        const mod = await import('./ssr');
        expect(mod.isServer).toBe(true);
        expect(mod.isClient).toBe(false);
    });

    it('getStorage/getSessionStorage return null', async () => {
        const mod = await import('./ssr');
        expect(mod.getStorage()).toBeNull();
        expect(mod.getSessionStorage()).toBeNull();
    });

    it('cookie storage getItem/setItem/removeItem all no-op instead of throwing', async () => {
        const mod = await import('./ssr');
        const cookies = mod.getCookieStorage();
        expect(cookies.getItem('x')).toBeNull();
        expect(() => cookies.setItem('x', 'y')).not.toThrow();
        expect(() => cookies.removeItem('x')).not.toThrow();
    });

    it('getPreferredStorage falls back to the (no-op) cookie storage', async () => {
        const mod = await import('./ssr');
        const preferred = mod.getPreferredStorage();
        expect(preferred.getItem('x')).toBeNull();
    });
});
