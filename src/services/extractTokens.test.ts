import { describe, expect, it } from 'vitest';
import { extractAccessToken } from './extractTokens';

describe('extractAccessToken', () => {
    it('extracts the token from a nested dot-notation path', () => {
        const token = extractAccessToken({ data: { access_token: 'abc123' } }, { accessTokenPath: 'data.access_token' }, 'LOGIN');
        expect(token).toBe('abc123');
    });

    it('defaults the path to access_token when none is configured', () => {
        const token = extractAccessToken({ access_token: 'abc' }, {}, 'LOGIN');
        expect(token).toBe('abc');
    });

    it('throws with the errorSource prefix when data is null', () => {
        expect(() => extractAccessToken(null, {}, 'LOGIN')).toThrow(/^LOGIN_ERROR: No data received\./);
    });

    it('throws when data is not an object (e.g. a string or number)', () => {
        expect(() => extractAccessToken('nope', {}, 'REFRESH')).toThrow(/^REFRESH_ERROR/);
        expect(() => extractAccessToken(42, {}, 'REFRESH')).toThrow(/^REFRESH_ERROR/);
    });

    it('throws when the token path resolves to undefined', () => {
        expect(() => extractAccessToken({ data: {} }, { accessTokenPath: 'data.access_token' }, 'LOGIN')).toThrow(
            /Access token not found or invalid at path 'data.access_token'/
        );
    });

    it('throws when the value at the path is not a string', () => {
        expect(() => extractAccessToken({ access_token: 12345 }, {}, 'LOGIN')).toThrow(/not found or invalid/);
        expect(() => extractAccessToken({ access_token: null }, {}, 'LOGIN')).toThrow(/not found or invalid/);
        expect(() => extractAccessToken({ access_token: {} }, {}, 'LOGIN')).toThrow(/not found or invalid/);
    });

    it('rejects an empty string token — falsy, same as missing', () => {
        expect(() => extractAccessToken({ access_token: '' }, {}, 'LOGIN')).toThrow(/not found or invalid/);
    });

    it('includes the configured path in the error message for debuggability', () => {
        expect(() => extractAccessToken({}, { accessTokenPath: 'weird.custom.path' }, 'LOGIN')).toThrow(
            /weird\.custom\.path/
        );
    });
});
