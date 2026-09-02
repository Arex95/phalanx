import { describe, expect, it } from 'vitest';
import { initialConnectionState, nextConnectionState, type ConnectionContext, type ConnectionEvent, type ConnectionState } from './connectionMachine';
import type { BackoffConfig } from './backoff';

const cfg: BackoffConfig = { baseMs: 1000, factor: 2, capMs: 30_000, maxAttempts: 3 };
const online: ConnectionContext = { online: true };
const offline: ConnectionContext = { online: false };
const zero = () => 0;

function run(from: ConnectionState, event: ConnectionEvent, ctx: ConnectionContext = online) {
    return nextConnectionState(from, event, ctx, cfg, zero);
}

describe('initial state', () => {
    it('starts idle', () => {
        expect(initialConnectionState).toEqual({ kind: 'idle' });
    });
});

describe('idle', () => {
    it('idle + authReady + online → connecting(1) + openStream', () => {
        const r = run(initialConnectionState, { kind: 'authReady' });
        expect(r.state).toEqual({ kind: 'connecting', attempt: 1 });
        expect(r.effects).toEqual([{ kind: 'openStream' }]);
    });

    it('idle + authReady + !online → offline (no effects)', () => {
        const r = run(initialConnectionState, { kind: 'authReady' }, offline);
        expect(r.state).toEqual({ kind: 'offline' });
        expect(r.effects).toEqual([]);
    });

    it('idle + authCleared → unauthenticated', () => {
        const r = run(initialConnectionState, { kind: 'authCleared' });
        expect(r.state).toEqual({ kind: 'unauthenticated' });
    });

    it('idle ignores unrelated events', () => {
        const r = run(initialConnectionState, { kind: 'connectOk' });
        expect(r.state).toEqual({ kind: 'idle' });
        expect(r.effects).toEqual([]);
    });
});

describe('unauthenticated', () => {
    it('+ authReady + online → connecting(1)', () => {
        const r = run({ kind: 'unauthenticated' }, { kind: 'authReady' });
        expect(r.state).toEqual({ kind: 'connecting', attempt: 1 });
        expect(r.effects).toEqual([{ kind: 'openStream' }]);
    });

    it('+ authReady + !online → offline', () => {
        const r = run({ kind: 'unauthenticated' }, { kind: 'authReady' }, offline);
        expect(r.state).toEqual({ kind: 'offline' });
    });
});

describe('offline', () => {
    it('+ goOnline → connecting(1)', () => {
        const r = run({ kind: 'offline' }, { kind: 'goOnline' });
        expect(r.state).toEqual({ kind: 'connecting', attempt: 1 });
    });

    it('+ authCleared → unauthenticated', () => {
        const r = run({ kind: 'offline' }, { kind: 'authCleared' });
        expect(r.state).toEqual({ kind: 'unauthenticated' });
    });
});

describe('connecting', () => {
    const state: ConnectionState = { kind: 'connecting', attempt: 1 };

    it('+ connectOk → open + reportSuccess', () => {
        const r = run(state, { kind: 'connectOk' });
        expect(r.state).toEqual({ kind: 'open' });
        expect(r.effects).toEqual([{ kind: 'reportSuccess' }]);
    });

    it('+ connectFail (attempt < max) → reconnecting(attempt+1) with backoff', () => {
        const r = run(state, { kind: 'connectFail' });
        expect(r.state.kind).toBe('reconnecting');
        if (r.state.kind === 'reconnecting') {
            expect(r.state.attempt).toBe(2);
            expect(r.state.delayMs).toBe(0);
        }
        expect(r.effects).toEqual([
            { kind: 'reportFailure' },
            { kind: 'scheduleTimer', delayMs: 0 }
        ]);
    });

    it('+ connectFail (last attempt reached) → circuitOpen', () => {
        const r = run({ kind: 'connecting', attempt: 3 }, { kind: 'connectFail' });
        expect(r.state).toEqual({ kind: 'circuitOpen' });
        expect(r.effects).toEqual([{ kind: 'reportFailure' }, { kind: 'abortStream' }]);
    });

    it('+ authErrorFromStream → consume un intento + abort + refreshAuth', () => {
        const r = run(state, { kind: 'authErrorFromStream' });
        expect(r.state).toEqual({ kind: 'connecting', attempt: 2 });
        expect(r.effects).toEqual([{ kind: 'abortStream' }, { kind: 'refreshAuth' }]);
    });

    it('+ authRefreshOk → conserva el intento (solo connectOk lo reinicia)', () => {
        const r = run({ kind: 'connecting', attempt: 2 }, { kind: 'authRefreshOk' });
        expect(r.state).toEqual({ kind: 'connecting', attempt: 2 });
    });

    it('+ authRefreshFail (attempt < max) → reconnecting', () => {
        const r = run(state, { kind: 'authRefreshFail' });
        expect(r.state.kind).toBe('reconnecting');
    });

    it('+ authRefreshFail (last attempt) → circuitOpen', () => {
        const r = run({ kind: 'connecting', attempt: 3 }, { kind: 'authRefreshFail' });
        expect(r.state).toEqual({ kind: 'circuitOpen' });
    });

    it('+ authCleared → unauthenticated + abort', () => {
        const r = run(state, { kind: 'authCleared' });
        expect(r.state).toEqual({ kind: 'unauthenticated' });
        expect(r.effects).toEqual([{ kind: 'abortStream' }]);
    });

    it('+ goOffline → offline + abort', () => {
        const r = run(state, { kind: 'goOffline' });
        expect(r.state).toEqual({ kind: 'offline' });
        expect(r.effects).toEqual([{ kind: 'abortStream' }]);
    });
});

describe('open', () => {
    const state: ConnectionState = { kind: 'open' };

    it('+ streamError → reconnecting(1) + reportFailure', () => {
        const r = run(state, { kind: 'streamError' });
        expect(r.state.kind).toBe('reconnecting');
        if (r.state.kind === 'reconnecting') expect(r.state.attempt).toBe(1);
        expect(r.effects[0]).toEqual({ kind: 'reportFailure' });
    });

    it('+ authErrorFromStream → connecting(1) + abort + refreshAuth', () => {
        const r = run(state, { kind: 'authErrorFromStream' });
        expect(r.state).toEqual({ kind: 'connecting', attempt: 1 });
        expect(r.effects).toEqual([{ kind: 'abortStream' }, { kind: 'refreshAuth' }]);
    });

    it('+ authCleared → unauthenticated + abort', () => {
        const r = run(state, { kind: 'authCleared' });
        expect(r.state).toEqual({ kind: 'unauthenticated' });
        expect(r.effects).toEqual([{ kind: 'abortStream' }]);
    });

    it('+ goOffline → offline + abort', () => {
        const r = run(state, { kind: 'goOffline' });
        expect(r.state).toEqual({ kind: 'offline' });
        expect(r.effects).toEqual([{ kind: 'abortStream' }]);
    });
});

describe('reconnecting', () => {
    const state: ConnectionState = { kind: 'reconnecting', attempt: 2, delayMs: 1000 };

    it('+ timerExpired → connecting(attempt) same attempt count', () => {
        const r = run(state, { kind: 'timerExpired' });
        expect(r.state).toEqual({ kind: 'connecting', attempt: 2 });
        expect(r.effects).toEqual([{ kind: 'openStream' }]);
    });

    it('+ userRetry → connecting(1) + cancelTimer + openStream', () => {
        const r = run(state, { kind: 'userRetry' });
        expect(r.state).toEqual({ kind: 'connecting', attempt: 1 });
        expect(r.effects).toEqual([{ kind: 'cancelTimer' }, { kind: 'openStream' }]);
    });

    it('+ authCleared → unauthenticated + cancelTimer', () => {
        const r = run(state, { kind: 'authCleared' });
        expect(r.state).toEqual({ kind: 'unauthenticated' });
        expect(r.effects).toEqual([{ kind: 'cancelTimer' }]);
    });

    it('+ goOffline → offline + cancelTimer', () => {
        const r = run(state, { kind: 'goOffline' });
        expect(r.state).toEqual({ kind: 'offline' });
        expect(r.effects).toEqual([{ kind: 'cancelTimer' }]);
    });
});

describe('circuitOpen', () => {
    const state: ConnectionState = { kind: 'circuitOpen' };

    it('+ userRetry → connecting(1)', () => {
        const r = run(state, { kind: 'userRetry' });
        expect(r.state).toEqual({ kind: 'connecting', attempt: 1 });
    });

    it('+ authCleared → unauthenticated', () => {
        const r = run(state, { kind: 'authCleared' });
        expect(r.state).toEqual({ kind: 'unauthenticated' });
    });

    it('+ goOnline → connecting(1) (auto-recover)', () => {
        const r = run(state, { kind: 'goOnline' });
        expect(r.state).toEqual({ kind: 'connecting', attempt: 1 });
    });

    it('+ goOffline → offline', () => {
        const r = run(state, { kind: 'goOffline' });
        expect(r.state).toEqual({ kind: 'offline' });
    });
});

describe('stop', () => {
    it('any state + stop → closed + abort + cancelTimer', () => {
        const states: ConnectionState[] = [
            { kind: 'idle' },
            { kind: 'unauthenticated' },
            { kind: 'offline' },
            { kind: 'connecting', attempt: 2 },
            { kind: 'open' },
            { kind: 'reconnecting', attempt: 1, delayMs: 500 },
            { kind: 'circuitOpen' }
        ];
        for (const s of states) {
            const r = run(s, { kind: 'stop' });
            expect(r.state).toEqual({ kind: 'closed' });
            expect(r.effects).toEqual([{ kind: 'abortStream' }, { kind: 'cancelTimer' }]);
        }
    });
});

describe('closed', () => {
    it('is terminal — ignores all events', () => {
        const state: ConnectionState = { kind: 'closed' };
        const events: ConnectionEvent[] = [
            { kind: 'authReady' },
            { kind: 'connectOk' },
            { kind: 'streamError' },
            { kind: 'goOnline' },
            { kind: 'userRetry' }
        ];
        for (const ev of events) {
            const r = run(state, ev);
            expect(r.state).toEqual({ kind: 'closed' });
            expect(r.effects).toEqual([]);
        }
    });
});

describe('bucle de auth contra un stream que siempre rechaza', () => {
    it('un refresh correcto no reinicia el contador de intentos', () => {
        const r = run({ kind: 'connecting', attempt: 2 }, { kind: 'authRefreshOk' });
        expect(r.state).toEqual({ kind: 'connecting', attempt: 2 });
    });

    it('cada 403 del stream consume un intento', () => {
        const r = run({ kind: 'connecting', attempt: 1 }, { kind: 'authErrorFromStream' });
        expect(r.state).toEqual({ kind: 'connecting', attempt: 2 });
        expect(r.effects).toEqual([{ kind: 'abortStream' }, { kind: 'refreshAuth' }]);
    });

    it('agotados los intentos abre el circuito en vez de seguir reintentando', () => {
        const r = run({ kind: 'connecting', attempt: cfg.maxAttempts }, { kind: 'authErrorFromStream' });
        expect(r.state).toEqual({ kind: 'circuitOpen' });
        expect(r.effects).toEqual([{ kind: 'reportFailure' }, { kind: 'abortStream' }]);
    });

    it('el ciclo 403 -> refresh ok -> 403 termina y no gira infinito', () => {
        let state: ConnectionState = { kind: 'open' };
        let vueltas = 0;
        while (state.kind !== 'circuitOpen' && vueltas < 50) {
            state = run(state, { kind: 'authErrorFromStream' }).state;
            if (state.kind === 'connecting') {
                state = run(state, { kind: 'authRefreshOk' }).state;
            }
            vueltas++;
        }
        expect(state).toEqual({ kind: 'circuitOpen' });
        expect(vueltas).toBeLessThanOrEqual(cfg.maxAttempts + 1);
    });
});
