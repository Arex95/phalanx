import { describe, expect, it } from 'vitest';
import { AuthError } from './AuthError';
import { ServerError } from './ServerError';
import { ValidationError } from './ValidationError';
import { NetworkError } from './NetworkError';

describe('BaseError (via a concrete subclass)', () => {
    it('sets name to the concrete subclass name, not "BaseError"', () => {
        const err = new AuthError('x');
        expect(err.name).toBe('AuthError');
    });

    it('is a real Error — instanceof Error holds', () => {
        expect(new ServerError()).toBeInstanceOf(Error);
    });

    it('stamps a timestamp at construction time', () => {
        const before = Date.now();
        const err = new NetworkError('x');
        expect(err.timestamp.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('stores the context object passed in', () => {
        const err = new ServerError('x', 500, { url: '/things' });
        expect(err.context).toEqual({ url: '/things' });
    });

    it('leaves context undefined when not provided', () => {
        expect(new ServerError().context).toBeUndefined();
    });

    it('toJSON produces a serializable, complete snapshot', () => {
        const err = new ValidationError('bad', [{ field: 'x', message: 'y' }], { url: '/a' });
        const json = err.toJSON();
        expect(json).toMatchObject({
            name: 'ValidationError',
            message: 'bad',
            code: 'VALIDATION_ERROR',
            statusCode: 422,
            context: { url: '/a' }
        });
        expect(typeof json.timestamp).toBe('string');
        expect(new Date(json.timestamp).toString()).not.toBe('Invalid Date');
    });

    it('has a captured stack trace', () => {
        expect(new AuthError().stack).toBeTruthy();
    });
});

describe('AuthError', () => {
    it('defaults to a generic message and 401', () => {
        const err = new AuthError();
        expect(err.message).toBe('Authentication failed');
        expect(err.statusCode).toBe(401);
        expect(err.code).toBe('AUTH_ERROR');
    });

    it('unauthorized() uses its own default message', () => {
        expect(AuthError.unauthorized().message).toBe('Unauthorized access');
    });

    it('unauthorized() accepts a custom message', () => {
        expect(AuthError.unauthorized('nope').message).toBe('nope');
    });

    it('tokenExpired() and tokenMissing() and tokenInvalid() have distinct fixed messages', () => {
        expect(AuthError.tokenExpired().message).toBe('Token has expired');
        expect(AuthError.tokenInvalid().message).toBe('Invalid token');
        expect(AuthError.tokenMissing().message).toBe('Authentication token is missing');
    });
});

describe('ServerError', () => {
    it('defaults to 500', () => {
        const err = new ServerError();
        expect(err.statusCode).toBe(500);
        expect(err.message).toBe('Server error occurred');
    });

    it('accepts a custom status code', () => {
        expect(new ServerError('x', 502).statusCode).toBe(502);
    });

    it('static factories set the right status code and a sensible default message', () => {
        expect(ServerError.internal().statusCode).toBe(500);
        expect(ServerError.badGateway().statusCode).toBe(502);
        expect(ServerError.serviceUnavailable().statusCode).toBe(503);
        expect(ServerError.gatewayTimeout().statusCode).toBe(504);
    });

    it('static factories accept a custom message override', () => {
        expect(ServerError.internal('custom').message).toBe('custom');
    });
});

describe('ValidationError', () => {
    it('defaults to 422 and an empty issues array', () => {
        const err = new ValidationError();
        expect(err.statusCode).toBe(422);
        expect(err.issues).toEqual([]);
    });

    it('fromIssues builds a message that reports the count', () => {
        const err = ValidationError.fromIssues([
            { field: 'a', message: 'x' },
            { field: 'b', message: 'y' }
        ]);
        expect(err.message).toBe('Validation failed: 2 issue(s)');
        expect(err.issues).toHaveLength(2);
    });

    it('fromField builds a single-issue error referencing the field name', () => {
        const err = ValidationError.fromField('email', 'is invalid', 'not-an-email');
        expect(err.message).toContain('email');
        expect(err.issues).toEqual([{ field: 'email', message: 'is invalid', value: 'not-an-email' }]);
    });

    it('fromField works without a value', () => {
        const err = ValidationError.fromField('email', 'is required');
        expect(err.issues[0]?.value).toBeUndefined();
    });
});

describe('NetworkError', () => {
    it('defaults to no status code', () => {
        expect(new NetworkError().statusCode).toBeUndefined();
    });

    it('stores the original error for later inspection', () => {
        const original = new Error('boom');
        const err = new NetworkError('x', undefined, original);
        expect(err.originalError).toBe(original);
    });

    describe('fromAxiosError', () => {
        it('prefers the response body message over the error message', () => {
            const err = NetworkError.fromAxiosError({
                message: 'axios default message',
                response: { status: 400, data: { message: 'backend message' } }
            });
            expect(err.message).toBe('backend message');
            expect(err.statusCode).toBe(400);
        });

        it('falls back to the axios error message when there is no response body message', () => {
            const err = NetworkError.fromAxiosError({ message: 'timeout of 5000ms exceeded' });
            expect(err.message).toBe('timeout of 5000ms exceeded');
        });

        it('falls back to a generic message when nothing else is available', () => {
            const err = NetworkError.fromAxiosError({});
            expect(err.message).toBe('Network request failed');
        });

        it('captures url/method/responseData in context', () => {
            const err = NetworkError.fromAxiosError({
                response: { status: 502, data: { detail: 'x' } },
                config: { url: '/things', method: 'post' }
            });
            expect(err.context).toEqual({ url: '/things', method: 'post', responseData: { detail: 'x' } });
        });
    });

    describe('fromFetchError', () => {
        it('uses the fetch error message and captures cause in context', () => {
            const cause = new Error('ECONNREFUSED');
            const err = NetworkError.fromFetchError({ message: 'fetch failed', cause });
            expect(err.message).toBe('fetch failed');
            expect(err.context).toEqual({ cause });
        });

        it('falls back to a generic message when the fetch error has none', () => {
            const err = NetworkError.fromFetchError({});
            expect(err.message).toBe('Network request failed');
        });
    });
});
