import { describe, expect, it } from 'vitest';
import axios from 'axios';
import { ERROR_CODE_HEADER, getErrorCode, isErrorCode } from './errorCodes';
import { normalizeHttpError } from './normalize';
import { AuthError } from './AuthError';

function axiosErrorWith(headers: Record<string, unknown>, status = 409) {
    return new axios.AxiosError(
        'Request failed',
        'ERR_BAD_REQUEST',
        { headers: new axios.AxiosHeaders() },
        { url: '/branches/1' },
        { status, data: { message: 'nope' }, headers } as never
    );
}

describe('getErrorCode', () => {
    it('reads the header from a normalized error', () => {
        const normalized = normalizeHttpError(
            axiosErrorWith({ 'x-error-code': 'DELETE_PROTECTION_ENABLED' })
        );
        expect(getErrorCode(normalized)).toBe('DELETE_PROTECTION_ENABLED');
    });

    it('reads the header from a raw axios error', () => {
        expect(getErrorCode(axiosErrorWith({ 'x-error-code': 'OTP_SETUP_REQUIRED' }))).toBe(
            'OTP_SETUP_REQUIRED'
        );
    });

    it('matches the header case-insensitively', () => {
        const normalized = normalizeHttpError(axiosErrorWith({ 'X-Error-Code': 'PASSWORD_CHANGE_REQUIRED' }));
        expect(getErrorCode(normalized)).toBe('PASSWORD_CHANGE_REQUIRED');
    });

    it('takes the first value when the header repeats', () => {
        const normalized = normalizeHttpError(axiosErrorWith({ 'x-error-code': ['FIRST', 'SECOND'] }));
        expect(getErrorCode(normalized)).toBe('FIRST');
    });

    it('accepts a different header name', () => {
        const normalized = normalizeHttpError(axiosErrorWith({ 'x-app-code': 'TENANT_SUSPENDED' }));
        expect(getErrorCode(normalized, 'x-app-code')).toBe('TENANT_SUSPENDED');
        expect(getErrorCode(normalized)).toBeNull();
    });

    it('returns null when the header is absent', () => {
        expect(getErrorCode(normalizeHttpError(axiosErrorWith({})))).toBeNull();
    });

    it('returns null for an error carrying no response at all', () => {
        expect(getErrorCode(new AuthError('nope'))).toBeNull();
        expect(getErrorCode(new Error('boom'))).toBeNull();
        expect(getErrorCode(null)).toBeNull();
        expect(getErrorCode('a string')).toBeNull();
    });

    it('ignores a non-string header value', () => {
        const normalized = normalizeHttpError(axiosErrorWith({ 'x-error-code': 42 }));
        expect(getErrorCode(normalized)).toBeNull();
    });
});

describe('isErrorCode', () => {
    it('is true only for an exact match', () => {
        const normalized = normalizeHttpError(
            axiosErrorWith({ [ERROR_CODE_HEADER]: 'DELETE_PROTECTION_ENABLED' })
        );
        expect(isErrorCode(normalized, 'DELETE_PROTECTION_ENABLED')).toBe(true);
        expect(isErrorCode(normalized, 'DELETE_PROTECTION')).toBe(false);
        expect(isErrorCode(new Error('boom'), 'ANYTHING')).toBe(false);
    });
});
