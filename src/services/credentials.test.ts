import { afterEach, describe, expect, it } from 'vitest';
import { accessToken, getAccessToken, isAuthenticated, setAccessToken } from './accessToken';
import { verifyAuth } from './credentials';

function fakeJwt(payload: Record<string, unknown>): string {
    const base64url = (obj: unknown) =>
        Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url(payload)}.signature`;
}

afterEach(() => {
    setAccessToken(null);
});

describe('accessToken', () => {
    it('starts as null and reflects what is set', () => {
        expect(getAccessToken()).toBeNull();
        setAccessToken('abc');
        expect(getAccessToken()).toBe('abc');
        expect(accessToken.value).toBe('abc');
    });

    it('isAuthenticated reflects presence, not validity', () => {
        expect(isAuthenticated.value).toBe(false);
        setAccessToken(fakeJwt({ exp: 0 })); // already expired
        // Presence-only: true even though this token is expired — this is
        // the documented, intentional distinction from verifyAuth().
        expect(isAuthenticated.value).toBe(true);
    });
});

describe('verifyAuth', () => {
    it('returns false when there is no token', () => {
        expect(verifyAuth()).toBe(false);
    });

    it('returns true for a token with a future exp', () => {
        setAccessToken(fakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 }));
        expect(verifyAuth()).toBe(true);
    });

    it('returns false and clears the token for an expired exp', () => {
        setAccessToken(fakeJwt({ exp: Math.floor(Date.now() / 1000) - 10 }));
        expect(verifyAuth()).toBe(false);
        expect(getAccessToken()).toBeNull();
    });

    it('returns false and clears the token when exp is missing', () => {
        setAccessToken(fakeJwt({ sub: 'user-1' }));
        expect(verifyAuth()).toBe(false);
        expect(getAccessToken()).toBeNull();
    });

    it('returns false and clears the token for a malformed token', () => {
        setAccessToken('not-a-real-jwt');
        expect(verifyAuth()).toBe(false);
        expect(getAccessToken()).toBeNull();
    });
});
