import { describe, expect, it } from 'vitest';
import { normalizeHttpError } from './normalize';
import { AuthError } from './AuthError';
import { ValidationError } from './ValidationError';
import { ServerError } from './ServerError';
import { NetworkError } from './NetworkError';
import { BaseError } from './BaseError';

function httpError(status: number, data?: unknown, headers?: Record<string, string>) {
    return {
        message: 'boom',
        isAxiosError: true,
        response: { status, data, headers },
        config: { url: '/things', method: 'post' }
    };
}

describe('normalizeHttpError', () => {
    it('maps 401 and 403 to AuthError', () => {
        expect(normalizeHttpError(httpError(401))).toBeInstanceOf(AuthError);
        expect(normalizeHttpError(httpError(403))).toBeInstanceOf(AuthError);
    });

    it('maps 422 to ValidationError', () => {
        const result = normalizeHttpError(httpError(422, { message: 'bad', errors: [] }));
        expect(result).toBeInstanceOf(ValidationError);
    });

    it('maps 5xx to ServerError with the real status code', () => {
        const result = normalizeHttpError(httpError(503)) as ServerError;
        expect(result).toBeInstanceOf(ServerError);
        expect(result.statusCode).toBe(503);
    });

    it('maps any other HTTP shape to NetworkError', () => {
        expect(normalizeHttpError(httpError(400))).toBeInstanceOf(NetworkError);
    });

    it('is idempotent — an already-normalized error passes through untouched', () => {
        const first = normalizeHttpError(httpError(401));
        expect(normalizeHttpError(first)).toBe(first);
    });

    it('returns non-HTTP-shaped errors unchanged', () => {
        const err = new Error('plain');
        expect(normalizeHttpError(err)).toBe(err);
    });

    // Regression test for a real bug: response headers were silently
    // dropped during normalization, breaking any consumer code that reads
    // a backend-specific header (e.g. `x-error-code`) after the error has
    // already been normalized — which is the only form it exists in by the
    // time app code ever sees it (see admin's errorCodes.ts/apiError.ts).
    it('preserves response headers in context.headers', () => {
        const result = normalizeHttpError(
            httpError(400, { message: 'x' }, { 'x-error-code': 'DELETE_PROTECTION_ENABLED' })
        ) as BaseError;
        expect((result.context?.headers as Record<string, string>)['x-error-code']).toBe(
            'DELETE_PROTECTION_ENABLED'
        );
    });

    it('preserves the raw response payload in context.responseData', () => {
        const body = { message: 'x', extra: 'field' };
        const result = normalizeHttpError(httpError(400, body)) as BaseError;
        expect(result.context?.responseData).toEqual(body);
    });

    describe('extractIssues (via ValidationError.issues)', () => {
        it('parses Spring Boot BindingResult shape', () => {
            const result = normalizeHttpError(
                httpError(422, {
                    errors: [{ field: 'email', defaultMessage: 'must not be blank', rejectedValue: '' }]
                })
            ) as ValidationError;
            expect(result.issues).toEqual([{ field: 'email', message: 'must not be blank', value: '' }]);
        });

        it('parses NestJS class-validator shape', () => {
            const result = normalizeHttpError(
                httpError(422, { message: ['email must not be empty', 'name is required'] })
            ) as ValidationError;
            expect(result.issues).toEqual([
                { field: '', message: 'email must not be empty' },
                { field: '', message: 'name is required' }
            ]);
        });

        it('parses JSON:API shape', () => {
            const result = normalizeHttpError(
                httpError(422, {
                    errors: [{ source: { pointer: '/data/attributes/email' }, detail: 'is invalid' }]
                })
            ) as ValidationError;
            expect(result.issues).toEqual([{ field: 'email', message: 'is invalid' }]);
        });

        it('parses Laravel shape', () => {
            const result = normalizeHttpError(
                httpError(422, { errors: { email: ['is invalid', 'is required'] } })
            ) as ValidationError;
            expect(result.issues).toEqual([
                { field: 'email', message: 'is invalid' },
                { field: 'email', message: 'is required' }
            ]);
        });

        it('returns an empty array for an unrecognised shape', () => {
            const result = normalizeHttpError(httpError(422, { weird: true })) as ValidationError;
            expect(result.issues).toEqual([]);
        });
    });
});

describe('normalizeHttpError — native fetch failures', () => {
    it('maps a native fetch TypeError to NetworkError via fromFetchError', () => {
        const err = normalizeHttpError(new TypeError('Failed to fetch'));
        expect(err).toBeInstanceOf(NetworkError);
        expect((err as NetworkError).message).toBe('Failed to fetch');
    });

    it('does not treat an unrelated TypeError as a fetch failure', () => {
        const err = normalizeHttpError(new TypeError('Cannot read properties of undefined'));
        expect(err).not.toBeInstanceOf(NetworkError);
    });
});
