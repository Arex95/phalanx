import { readonly, ref, watch, type Ref } from 'vue';
import { accessToken, getAccessToken } from '../services/accessToken';
import { refreshTokens } from '../services/refreshTokens';
import { reportBackendFailure, reportBackendSuccess } from '../health/backendHealth';
import { DEFAULT_BACKOFF, type BackoffConfig } from './backoff';
import {
    initialConnectionState,
    nextConnectionState,
    type ConnectionEffect,
    type ConnectionEvent,
    type ConnectionState
} from './connectionMachine';

/** What the driver hands a transport when it is time to open a stream. */
export interface StreamContext {
    /** The current access token. Never null — the driver checks first. */
    token: string;
    /** Abort signal. The transport must stop when it fires. */
    signal: AbortSignal;
    /** Report a successful open. */
    onOpen: () => void;
    /** Report a 401/403 from the stream, which triggers a token refresh. */
    onAuthError: () => void;
    /** Report a failure to open. */
    onConnectError: () => void;
    /** Report a stream that was open and then broke. */
    onStreamError: () => void;
}

/**
 * Opens the stream. Returning a promise that settles is fine; the driver does
 * not wait on it. Report progress through the callbacks on `ctx`.
 */
export type StreamOpener = (ctx: StreamContext) => void | Promise<void>;

export interface RealtimeConnectionOptions {
    /**
     * Opens the stream. The library ships no transport: wire
     * `@microsoft/fetch-event-source`, a `WebSocket`, or anything else.
     */
    open: StreamOpener;
    backoff?: BackoffConfig;
    /**
     * Report failures and recoveries to the shared backend-health state.
     * Default `true`.
     */
    reportHealth?: boolean;
}

/**
 * Keeps a long-lived stream connected across token expiry, network loss and a
 * server that goes away.
 *
 * The behaviour lives in `connectionMachine`; this class performs its effects.
 * It subscribes to the access token, listens for `online`/`offline`, retries
 * with capped exponential backoff, refreshes the token when the stream rejects
 * it, and stops after `maxAttempts` until someone calls `retryNow()`.
 *
 * ```ts
 * const connection = new RealtimeConnection({
 *     open: ({ token, signal, onOpen, onAuthError, onConnectError, onStreamError }) =>
 *         fetchEventSource(url, {
 *             signal,
 *             headers: { Authorization: `Bearer ${token}` },
 *             onopen: async (res) => {
 *                 if (res.ok) return onOpen();
 *                 if (res.status === 401 || res.status === 403) return onAuthError();
 *                 onConnectError();
 *             },
 *             onmessage: handle,
 *             onerror: onStreamError
 *         })
 * });
 *
 * connection.start();
 * ```
 */
export class RealtimeConnection {
    private state = ref<ConnectionState>(initialConnectionState);
    private controller: AbortController | null = null;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private stopWatchingToken: (() => void) | null = null;
    private onlineListener: (() => void) | null = null;
    private offlineListener: (() => void) | null = null;
    private started = false;

    constructor(private readonly options: RealtimeConnectionOptions) {}

    /** Current state, for a status indicator. */
    get status(): Readonly<Ref<ConnectionState>> {
        return readonly(this.state) as Readonly<Ref<ConnectionState>>;
    }

    start(): void {
        if (this.started) return;
        this.started = true;

        this.stopWatchingToken = watch(accessToken, (token) => {
            this.dispatch(token ? { kind: 'authReady' } : { kind: 'authCleared' });
        });

        if (typeof window !== 'undefined') {
            this.onlineListener = () => this.dispatch({ kind: 'goOnline' });
            this.offlineListener = () => this.dispatch({ kind: 'goOffline' });
            window.addEventListener('online', this.onlineListener);
            window.addEventListener('offline', this.offlineListener);
        }

        if (!this.isOnline()) this.dispatch({ kind: 'goOffline' });
        if (getAccessToken()) this.dispatch({ kind: 'authReady' });
    }

    stop(): void {
        if (!this.started) return;
        this.started = false;
        this.dispatch({ kind: 'stop' });

        this.stopWatchingToken?.();
        this.stopWatchingToken = null;

        if (typeof window !== 'undefined') {
            if (this.onlineListener) window.removeEventListener('online', this.onlineListener);
            if (this.offlineListener) window.removeEventListener('offline', this.offlineListener);
        }
        this.onlineListener = null;
        this.offlineListener = null;
    }

    /** Leaves the give-up state and tries again immediately. */
    retryNow(): void {
        this.dispatch({ kind: 'userRetry' });
    }

    private isOnline(): boolean {
        return typeof navigator === 'undefined' ? true : navigator.onLine;
    }

    private dispatch(event: ConnectionEvent): void {
        const { state, effects } = nextConnectionState(
            this.state.value,
            event,
            { online: this.isOnline() },
            this.options.backoff ?? DEFAULT_BACKOFF
        );
        this.state.value = state;
        for (const effect of effects) this.runEffect(effect);
    }

    private runEffect(effect: ConnectionEffect): void {
        switch (effect.kind) {
            case 'openStream':
                void this.openStream();
                return;
            case 'abortStream':
                this.abortStream();
                return;
            case 'scheduleTimer':
                this.scheduleTimer(effect.delayMs);
                return;
            case 'cancelTimer':
                this.cancelTimer();
                return;
            case 'refreshAuth':
                void this.refreshAuth();
                return;
            case 'reportSuccess':
                if (this.options.reportHealth !== false) reportBackendSuccess();
                return;
            case 'reportFailure':
                if (this.options.reportHealth !== false) reportBackendFailure();
                return;
        }
    }

    private abortStream(): void {
        this.controller?.abort();
        this.controller = null;
    }

    private scheduleTimer(delayMs: number): void {
        this.cancelTimer();
        this.timer = setTimeout(() => {
            this.timer = null;
            this.dispatch({ kind: 'timerExpired' });
        }, delayMs);
    }

    private cancelTimer(): void {
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    private async refreshAuth(): Promise<void> {
        try {
            await refreshTokens();
            this.dispatch(getAccessToken() ? { kind: 'authRefreshOk' } : { kind: 'authRefreshFail' });
        } catch {
            this.dispatch({ kind: 'authRefreshFail' });
        }
    }

    private async openStream(): Promise<void> {
        const token = getAccessToken();
        if (!token) {
            this.dispatch({ kind: 'authCleared' });
            return;
        }

        this.abortStream();
        const controller = new AbortController();
        this.controller = controller;

        try {
            await this.options.open({
                token,
                signal: controller.signal,
                onOpen: () => this.dispatch({ kind: 'connectOk' }),
                onAuthError: () => this.dispatch({ kind: 'authErrorFromStream' }),
                onConnectError: () => this.dispatch({ kind: 'connectFail' }),
                onStreamError: () =>
                    this.dispatch(
                        this.state.value.kind === 'open'
                            ? { kind: 'streamError' }
                            : { kind: 'connectFail' }
                    )
            });
        } catch {
            // A transport that throws has already reported through the
            // callbacks, or is aborting. Either way the machine has the event
            // it needs and a rethrow here would surface as an unhandled
            // rejection.
        }
    }
}
