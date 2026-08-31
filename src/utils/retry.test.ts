import { describe, expect, it, vi } from 'vitest';
import { retryWithBackoff } from './retry';
import { NetworkError } from '@/errors/NetworkError';
import { ServerError } from '@/errors/ServerError';
import { ValidationError } from '@/errors/ValidationError';

describe('retryWithBackoff', () => {
    it('returns the result immediately on first success — no retries, no delay', async () => {
        const fn = vi.fn().mockResolvedValue('ok');
        const result = await retryWithBackoff(fn);
        expect(result).toBe('ok');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries a retryable error up to the configured count, then succeeds', async () => {
        const fn = vi
            .fn()
            .mockRejectedValueOnce(new ServerError('x', 500))
            .mockRejectedValueOnce(new ServerError('x', 500))
            .mockResolvedValue('ok');

        const result = await retryWithBackoff(fn, { retries: 3, retryDelay: 1 });
        expect(result).toBe('ok');
        expect(fn).toHaveBeenCalledTimes(3);
    });

    it('throws the last error once retries are exhausted', async () => {
        const finalError = new ServerError('still failing', 503);
        const fn = vi.fn().mockRejectedValue(finalError);

        await expect(retryWithBackoff(fn, { retries: 2, retryDelay: 1 })).rejects.toBe(finalError);
        expect(fn).toHaveBeenCalledTimes(3); // initial attempt + 2 retries
    });

    it('does not retry an error the retryCondition rejects — fails immediately', async () => {
        const fn = vi.fn().mockRejectedValue(new ValidationError('bad input'));
        await expect(retryWithBackoff(fn, { retries: 5, retryDelay: 1 })).rejects.toBeInstanceOf(ValidationError);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('default retryCondition retries NetworkError/ServerError with no statusCode', async () => {
        const fn = vi.fn().mockRejectedValueOnce(new NetworkError('timeout')).mockResolvedValue('ok');
        const result = await retryWithBackoff(fn, { retryDelay: 1 });
        expect(result).toBe('ok');
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('default retryCondition retries 408 and 429 specifically', async () => {
        const fn408 = vi.fn().mockRejectedValueOnce(new NetworkError('x', 408)).mockResolvedValue('ok');
        await expect(retryWithBackoff(fn408, { retryDelay: 1 })).resolves.toBe('ok');

        const fn429 = vi.fn().mockRejectedValueOnce(new NetworkError('x', 429)).mockResolvedValue('ok');
        await expect(retryWithBackoff(fn429, { retryDelay: 1 })).resolves.toBe('ok');
    });

    it('default retryCondition does NOT retry a 4xx NetworkError other than 408/429', async () => {
        const fn = vi.fn().mockRejectedValue(new NetworkError('x', 404));
        await expect(retryWithBackoff(fn, { retryDelay: 1 })).rejects.toBeInstanceOf(NetworkError);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('default retryCondition retries a plain Error mentioning "timeout" or "network"', async () => {
        const fn = vi.fn().mockRejectedValueOnce(new Error('request timeout')).mockResolvedValue('ok');
        await expect(retryWithBackoff(fn, { retryDelay: 1 })).resolves.toBe('ok');
    });

    it('default retryCondition does not retry an unrelated plain Error', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('totally unrelated'));
        await expect(retryWithBackoff(fn, { retryDelay: 1 })).rejects.toThrow('totally unrelated');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('does not retry a non-Error, non-typed thrown value', async () => {
        const fn = vi.fn().mockRejectedValue('a plain string throw');
        await expect(retryWithBackoff(fn, { retryDelay: 1 })).rejects.toBe('a plain string throw');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('honors a custom retryCondition', async () => {
        const fn = vi.fn().mockRejectedValueOnce(new Error('custom')).mockResolvedValue('ok');
        const retryCondition = vi.fn(() => true);
        const result = await retryWithBackoff(fn, { retries: 1, retryDelay: 1, retryCondition });
        expect(result).toBe('ok');
        expect(retryCondition).toHaveBeenCalledTimes(1);
    });

    it('caps the backoff delay at maxRetryDelay', async () => {
        vi.useFakeTimers();
        try {
            const fn = vi
                .fn()
                .mockRejectedValueOnce(new NetworkError('x'))
                .mockRejectedValueOnce(new NetworkError('x'))
                .mockResolvedValue('ok');

            const promise = retryWithBackoff(fn, {
                retries: 2,
                retryDelay: 100,
                backoffMultiplier: 10,
                maxRetryDelay: 150
            });

            await vi.advanceTimersByTimeAsync(100); // first retry delay: 100
            await vi.advanceTimersByTimeAsync(150); // second retry delay: capped at 150, not 1000
            const result = await promise;
            expect(result).toBe('ok');
        } finally {
            vi.useRealTimers();
        }
    });
});
