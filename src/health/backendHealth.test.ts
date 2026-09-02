import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    configBackendHealth,
    onBackendRecovered,
    reportBackendFailure,
    reportBackendSuccess,
    resetBackendHealth,
    retryBackend,
    useBackendHealth
} from './backendHealth';

describe('backend health', () => {
    beforeEach(() => {
        resetBackendHealth();
    });

    it('starts healthy', () => {
        expect(useBackendHealth().isDown.value).toBe(false);
    });

    it('stays healthy below the threshold', () => {
        reportBackendFailure(1_000);
        expect(useBackendHealth().isDown.value).toBe(false);
    });

    it('goes down at the threshold', () => {
        reportBackendFailure(1_000);
        reportBackendFailure(2_000);
        expect(useBackendHealth().isDown.value).toBe(true);
        expect(useBackendHealth().status.value).toBe('down');
    });

    it('does not count failures spread beyond the window', () => {
        reportBackendFailure(1_000);
        reportBackendFailure(20_000); // outside the 8s window: a new streak
        expect(useBackendHealth().isDown.value).toBe(false);
    });

    it('recovers on the first success', () => {
        reportBackendFailure(1_000);
        reportBackendFailure(2_000);
        reportBackendSuccess();
        expect(useBackendHealth().isDown.value).toBe(false);
    });

    it('a success resets the streak, so two more failures are needed', () => {
        reportBackendFailure(1_000);
        reportBackendSuccess();
        reportBackendFailure(2_000);
        expect(useBackendHealth().isDown.value).toBe(false);
        reportBackendFailure(3_000);
        expect(useBackendHealth().isDown.value).toBe(true);
    });

    it('honours a configured threshold and window', () => {
        configBackendHealth({ threshold: 3, windowMs: 1_000 });
        reportBackendFailure(0);
        reportBackendFailure(500);
        expect(useBackendHealth().isDown.value).toBe(false);
        reportBackendFailure(900);
        expect(useBackendHealth().isDown.value).toBe(true);
    });

    it('runs recovery handlers on retry', async () => {
        const handler = vi.fn();
        onBackendRecovered(handler);
        await retryBackend();
        expect(handler).toHaveBeenCalledOnce();
    });

    it('unsubscribes a recovery handler', async () => {
        const handler = vi.fn();
        onBackendRecovered(handler)();
        await retryBackend();
        expect(handler).not.toHaveBeenCalled();
    });

    it('one failing handler does not stop the others', async () => {
        const ok = vi.fn();
        onBackendRecovered(() => Promise.reject(new Error('boom')));
        onBackendRecovered(ok);
        await expect(retryBackend()).resolves.toBeUndefined();
        expect(ok).toHaveBeenCalledOnce();
    });

    it('isRetrying is true while handlers run and false after', async () => {
        let release!: () => void;
        onBackendRecovered(() => new Promise<void>((resolve) => (release = resolve)));

        const health = useBackendHealth();
        const pending = retryBackend();
        expect(health.isRetrying.value).toBe(true);

        release();
        await pending;
        expect(health.isRetrying.value).toBe(false);
    });

    it('ignores a retry while one is already running', async () => {
        const handler = vi.fn(() => new Promise<void>((resolve) => setTimeout(resolve, 5)));
        onBackendRecovered(handler);

        const first = retryBackend();
        await retryBackend();
        await first;

        expect(handler).toHaveBeenCalledOnce();
    });
});
