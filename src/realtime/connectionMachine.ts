/**
 * The reconnection state machine, as a pure function.
 *
 * It owns no socket, no timer and no clock: given the current state and an
 * event it returns the next state plus the effects a driver must perform. That
 * separation is what makes every transition — including the ones that only
 * happen during an outage — testable without opening a connection.
 *
 * `RealtimeConnection` is the driver that runs the effects. Use this directly
 * only to build a different one.
 */
import { computeDelay, shouldGiveUp, type BackoffConfig, DEFAULT_BACKOFF } from './backoff';

export type ConnectionState =
    | { kind: 'idle' }
    | { kind: 'unauthenticated' }
    | { kind: 'offline' }
    | { kind: 'connecting'; attempt: number }
    | { kind: 'open' }
    | { kind: 'reconnecting'; attempt: number; delayMs: number }
    | { kind: 'circuitOpen' }
    | { kind: 'closed' };

export type ConnectionEvent =
    | { kind: 'authReady' }
    | { kind: 'authCleared' }
    | { kind: 'connectOk' }
    | { kind: 'connectFail' }
    | { kind: 'authErrorFromStream' }
    | { kind: 'authRefreshOk' }
    | { kind: 'authRefreshFail' }
    | { kind: 'streamError' }
    | { kind: 'timerExpired' }
    | { kind: 'userRetry' }
    | { kind: 'goOffline' }
    | { kind: 'goOnline' }
    | { kind: 'stop' };

export type ConnectionEffect =
    | { kind: 'openStream' }
    | { kind: 'abortStream' }
    | { kind: 'scheduleTimer'; delayMs: number }
    | { kind: 'cancelTimer' }
    | { kind: 'refreshAuth' }
    | { kind: 'reportSuccess' }
    | { kind: 'reportFailure' };

export interface ConnectionContext {
    online: boolean;
}

export interface ConnectionTransition {
    state: ConnectionState;
    effects: ConnectionEffect[];
}

export const initialConnectionState: ConnectionState = { kind: 'idle' };

function connecting(attempt: number): ConnectionTransition {
    return { state: { kind: 'connecting', attempt }, effects: [{ kind: 'openStream' }] };
}

function reconnecting(nextAttempt: number, config: BackoffConfig, random?: () => number): ConnectionTransition {
    const delayMs = computeDelay(nextAttempt - 1, config, random);
    return {
        state: { kind: 'reconnecting', attempt: nextAttempt, delayMs },
        effects: [{ kind: 'reportFailure' }, { kind: 'scheduleTimer', delayMs }]
    };
}

export function nextConnectionState(
    state: ConnectionState,
    event: ConnectionEvent,
    ctx: ConnectionContext,
    config: BackoffConfig = DEFAULT_BACKOFF,
    random?: () => number
): ConnectionTransition {
    if (event.kind === 'stop') {
        return { state: { kind: 'closed' }, effects: [{ kind: 'abortStream' }, { kind: 'cancelTimer' }] };
    }

    switch (state.kind) {
        case 'idle': {
            if (event.kind === 'authReady') {
                return ctx.online ? connecting(1) : { state: { kind: 'offline' }, effects: [] };
            }
            if (event.kind === 'authCleared') return { state: { kind: 'unauthenticated' }, effects: [] };
            if (event.kind === 'goOffline') return { state: { kind: 'offline' }, effects: [] };
            return { state, effects: [] };
        }

        case 'unauthenticated': {
            if (event.kind === 'authReady' && ctx.online) return connecting(1);
            if (event.kind === 'authReady' && !ctx.online) return { state: { kind: 'offline' }, effects: [] };
            return { state, effects: [] };
        }

        case 'offline': {
            if (event.kind === 'goOnline') return connecting(1);
            if (event.kind === 'authCleared') return { state: { kind: 'unauthenticated' }, effects: [] };
            return { state, effects: [] };
        }

        case 'connecting': {
            if (event.kind === 'connectOk') {
                return { state: { kind: 'open' }, effects: [{ kind: 'reportSuccess' }] };
            }
            if (event.kind === 'authErrorFromStream') {
                if (shouldGiveUp(state.attempt, config)) {
                    return { state: { kind: 'circuitOpen' }, effects: [{ kind: 'reportFailure' }, { kind: 'abortStream' }] };
                }
                return {
                    state: { kind: 'connecting', attempt: state.attempt + 1 },
                    effects: [{ kind: 'abortStream' }, { kind: 'refreshAuth' }]
                };
            }
            if (event.kind === 'connectFail' || event.kind === 'authRefreshFail') {
                if (shouldGiveUp(state.attempt, config)) {
                    return { state: { kind: 'circuitOpen' }, effects: [{ kind: 'reportFailure' }, { kind: 'abortStream' }] };
                }
                return reconnecting(state.attempt + 1, config, random);
            }
            if (event.kind === 'authRefreshOk') {
                return connecting(state.attempt);
            }
            if (event.kind === 'authCleared') {
                return { state: { kind: 'unauthenticated' }, effects: [{ kind: 'abortStream' }] };
            }
            if (event.kind === 'goOffline') {
                return { state: { kind: 'offline' }, effects: [{ kind: 'abortStream' }] };
            }
            return { state, effects: [] };
        }

        case 'open': {
            if (event.kind === 'streamError') {
                return reconnecting(1, config, random);
            }
            if (event.kind === 'authErrorFromStream') {
                return { state: { kind: 'connecting', attempt: 1 }, effects: [{ kind: 'abortStream' }, { kind: 'refreshAuth' }] };
            }
            if (event.kind === 'authCleared') {
                return { state: { kind: 'unauthenticated' }, effects: [{ kind: 'abortStream' }] };
            }
            if (event.kind === 'goOffline') {
                return { state: { kind: 'offline' }, effects: [{ kind: 'abortStream' }] };
            }
            return { state, effects: [] };
        }

        case 'reconnecting': {
            if (event.kind === 'timerExpired') return connecting(state.attempt);
            if (event.kind === 'userRetry') return { state: { kind: 'connecting', attempt: 1 }, effects: [{ kind: 'cancelTimer' }, { kind: 'openStream' }] };
            if (event.kind === 'authCleared') return { state: { kind: 'unauthenticated' }, effects: [{ kind: 'cancelTimer' }] };
            if (event.kind === 'goOffline') return { state: { kind: 'offline' }, effects: [{ kind: 'cancelTimer' }] };
            return { state, effects: [] };
        }

        case 'circuitOpen': {
            if (event.kind === 'userRetry') return connecting(1);
            if (event.kind === 'authCleared') return { state: { kind: 'unauthenticated' }, effects: [] };
            if (event.kind === 'goOnline') return connecting(1);
            if (event.kind === 'goOffline') return { state: { kind: 'offline' }, effects: [] };
            return { state, effects: [] };
        }

        case 'closed': {
            return { state, effects: [] };
        }
    }
}
