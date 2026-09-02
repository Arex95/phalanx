import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { setAccessToken } from '../services/accessToken';
import { resetBackendHealth, useBackendHealth } from '../health/backendHealth';
import { RealtimeConnection, type StreamContext } from './RealtimeConnection';

vi.mock('../services/refreshTokens', () => ({
    refreshTokens: vi.fn(async () => ({}))
}));
const { refreshTokens } = await import('../services/refreshTokens');

const FAST = { baseMs: 1, factor: 2, capMs: 4, maxAttempts: 3 };

/** Captures each open call so a test can drive the transport by hand. */
function recorder() {
    const calls: StreamContext[] = [];
    return {
        calls,
        open: (ctx: StreamContext) => {
            calls.push(ctx);
        },
        last: () => calls[calls.length - 1]
    };
}

describe('RealtimeConnection', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        setAccessToken(null);
        resetBackendHealth();
        vi.mocked(refreshTokens).mockClear();
        vi.mocked(refreshTokens).mockImplementation(async () => ({}));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('does not open a stream without a token', () => {
        const t = recorder();
        const connection = new RealtimeConnection({ open: t.open, backoff: FAST });
        connection.start();
        expect(t.calls).toHaveLength(0);
        expect(connection.status.value.kind).toBe('idle');
        connection.stop();
    });

    it('opens as soon as a token exists', () => {
        setAccessToken('tok');
        const t = recorder();
        const connection = new RealtimeConnection({ open: t.open, backoff: FAST });
        connection.start();
        expect(t.calls).toHaveLength(1);
        expect(t.last().token).toBe('tok');
        expect(connection.status.value.kind).toBe('connecting');
        connection.stop();
    });

    it('opens when the token arrives after start', async () => {
        const t = recorder();
        const connection = new RealtimeConnection({ open: t.open, backoff: FAST });
        connection.start();
        setAccessToken('tok');
        await nextTick();
        expect(t.calls).toHaveLength(1);
        connection.stop();
    });

    it('reaches open and reports the backend healthy', () => {
        setAccessToken('tok');
        const t = recorder();
        const connection = new RealtimeConnection({ open: t.open, backoff: FAST });
        connection.start();
        t.last().onOpen();
        expect(connection.status.value.kind).toBe('open');
        expect(useBackendHealth().isDown.value).toBe(false);
        connection.stop();
    });

    it('retries after a failure, once the backoff delay elapses', () => {
        setAccessToken('tok');
        const t = recorder();
        const connection = new RealtimeConnection({ open: t.open, backoff: FAST });
        connection.start();

        t.last().onConnectError();
        expect(connection.status.value.kind).toBe('reconnecting');
        expect(t.calls).toHaveLength(1);

        vi.advanceTimersByTime(100);
        expect(t.calls).toHaveLength(2);
        connection.stop();
    });

    it('gives up after maxAttempts and waits for retryNow', () => {
        setAccessToken('tok');
        const t = recorder();
        const connection = new RealtimeConnection({ open: t.open, backoff: FAST });
        connection.start();

        t.last().onConnectError();
        vi.advanceTimersByTime(100);
        t.last().onConnectError();
        vi.advanceTimersByTime(100);
        t.last().onConnectError();

        expect(connection.status.value.kind).toBe('circuitOpen');
        const attempts = t.calls.length;

        vi.advanceTimersByTime(10_000);
        expect(t.calls).toHaveLength(attempts);

        connection.retryNow();
        expect(t.calls).toHaveLength(attempts + 1);
        expect(connection.status.value.kind).toBe('connecting');
        connection.stop();
    });

    it('marks the backend down once the failures pass the threshold', () => {
        setAccessToken('tok');
        const t = recorder();
        const connection = new RealtimeConnection({ open: t.open, backoff: FAST });
        connection.start();

        t.last().onConnectError();
        vi.advanceTimersByTime(100);
        t.last().onConnectError();

        expect(useBackendHealth().isDown.value).toBe(true);
        connection.stop();
    });

    it('leaves backend health alone when reportHealth is false', () => {
        setAccessToken('tok');
        const t = recorder();
        const connection = new RealtimeConnection({
            open: t.open,
            backoff: FAST,
            reportHealth: false
        });
        connection.start();

        t.last().onConnectError();
        vi.advanceTimersByTime(100);
        t.last().onConnectError();

        expect(useBackendHealth().isDown.value).toBe(false);
        connection.stop();
    });

    it('refreshes the token when the stream rejects it, then reopens', async () => {
        setAccessToken('tok');
        const t = recorder();
        vi.mocked(refreshTokens).mockImplementation(async () => {
            setAccessToken('fresh');
            return {};
        });

        const connection = new RealtimeConnection({ open: t.open, backoff: FAST });
        connection.start();
        t.last().onAuthError();

        await vi.waitFor(() => expect(refreshTokens).toHaveBeenCalledOnce());
        await vi.waitFor(() => expect(t.calls.length).toBeGreaterThan(1));
        expect(t.last().token).toBe('fresh');
        connection.stop();
    });

    it('retries rather than dying when the refresh fails', async () => {
        setAccessToken('tok');
        const t = recorder();
        vi.mocked(refreshTokens).mockRejectedValue(new Error('expired'));

        const connection = new RealtimeConnection({ open: t.open, backoff: FAST });
        connection.start();
        t.last().onAuthError();

        // A failed refresh must not leave the connection stuck: it schedules
        // another attempt. Asserting the intermediate `reconnecting` state
        // would be a race — with a 1ms backoff the timer has often already
        // fired by the time the assertion runs.
        await vi.waitFor(() => expect(refreshTokens).toHaveBeenCalledOnce());
        await vi.waitFor(() => expect(t.calls.length).toBeGreaterThan(1));
        expect(connection.status.value.kind).not.toBe('open');
        connection.stop();
    });

    it('closes and does not reopen when the token is cleared', async () => {
        setAccessToken('tok');
        const t = recorder();
        const connection = new RealtimeConnection({ open: t.open, backoff: FAST });
        connection.start();
        t.last().onOpen();

        setAccessToken(null);
        await nextTick();

        expect(connection.status.value.kind).toBe('unauthenticated');
        expect(t.last().signal.aborted).toBe(true);
        connection.stop();
    });

    it('aborts the stream on stop and ignores later events', () => {
        setAccessToken('tok');
        const t = recorder();
        const connection = new RealtimeConnection({ open: t.open, backoff: FAST });
        connection.start();
        const ctx = t.last();

        connection.stop();

        expect(ctx.signal.aborted).toBe(true);
        expect(connection.status.value.kind).toBe('closed');
        vi.advanceTimersByTime(10_000);
        expect(t.calls).toHaveLength(1);
    });

    it('reconnects when an established stream breaks', () => {
        setAccessToken('tok');
        const t = recorder();
        const connection = new RealtimeConnection({ open: t.open, backoff: FAST });
        connection.start();
        t.last().onOpen();
        expect(connection.status.value.kind).toBe('open');

        t.last().onStreamError();
        expect(connection.status.value.kind).toBe('reconnecting');

        vi.advanceTimersByTime(100);
        expect(t.calls).toHaveLength(2);
        connection.stop();
    });

    it('treats a break before open as a failed connect', () => {
        setAccessToken('tok');
        const t = recorder();
        const connection = new RealtimeConnection({ open: t.open, backoff: FAST });
        connection.start();

        // never opened: onStreamError must not be read as "an open stream died"
        t.last().onStreamError();
        expect(connection.status.value.kind).toBe('reconnecting');
        connection.stop();
    });

    it('is idempotent on start and stop', () => {
        setAccessToken('tok');
        const t = recorder();
        const connection = new RealtimeConnection({ open: t.open, backoff: FAST });
        connection.start();
        connection.start();
        expect(t.calls).toHaveLength(1);
        connection.stop();
        connection.stop();
    });

    it('survives a transport that throws instead of reporting', async () => {
        setAccessToken('tok');
        const connection = new RealtimeConnection({
            open: () => {
                throw new Error('transport exploded');
            },
            backoff: FAST
        });
        expect(() => connection.start()).not.toThrow();
        connection.stop();
    });
});
