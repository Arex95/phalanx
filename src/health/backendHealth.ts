import { computed, ref, type ComputedRef } from 'vue';

export type BackendStatus = 'healthy' | 'down';

export interface BackendHealthOptions {
    /** Consecutive failures before the backend is considered down. Default 2. */
    threshold?: number;
    /** Window in which failures count as consecutive. Default 8000 ms. */
    windowMs?: number;
}

const DEFAULTS = { threshold: 2, windowMs: 8_000 };

const status = ref<BackendStatus>('healthy');
const consecutiveFailures = ref(0);
const firstFailureAt = ref<number | null>(null);
const isRetrying = ref(false);

let options = { ...DEFAULTS };
const recoveryHandlers = new Set<() => void | Promise<void>>();

/** Overrides the thresholds. Call once, before anything reports. */
export function configBackendHealth(config: BackendHealthOptions): void {
    options = { ...DEFAULTS, ...config };
}

/**
 * Registers work to run when the backend comes back — refetching queries, for
 * instance. Returns an unsubscribe function.
 *
 * The library does not import a query client: what "recover" means belongs to
 * the application.
 */
export function onBackendRecovered(handler: () => void | Promise<void>): () => void {
    recoveryHandlers.add(handler);
    return () => recoveryHandlers.delete(handler);
}

/** A request failed in a way that suggests the backend, not the request. */
export function reportBackendFailure(now: number = Date.now()): void {
    const first = firstFailureAt.value;
    if (first === null || now - first > options.windowMs) {
        firstFailureAt.value = now;
        consecutiveFailures.value = 1;
    } else {
        consecutiveFailures.value += 1;
    }
    if (consecutiveFailures.value >= options.threshold) {
        status.value = 'down';
    }
}

/** A request succeeded. Clears the streak and marks the backend healthy. */
export function reportBackendSuccess(): void {
    consecutiveFailures.value = 0;
    firstFailureAt.value = null;
    status.value = 'healthy';
}

/**
 * Runs the registered recovery handlers. `isRetrying` stays true until they
 * all settle, so a retry button can disable itself.
 */
export async function retryBackend(): Promise<void> {
    if (isRetrying.value) return;
    isRetrying.value = true;
    try {
        await Promise.allSettled(Array.from(recoveryHandlers, (handler) => handler()));
    } finally {
        isRetrying.value = false;
    }
}

export interface BackendHealth {
    status: ComputedRef<BackendStatus>;
    isDown: ComputedRef<boolean>;
    isRetrying: ComputedRef<boolean>;
    retry: () => Promise<void>;
}

/** Reactive view of the backend's health, for a banner or an offline screen. */
export function useBackendHealth(): BackendHealth {
    return {
        status: computed(() => status.value),
        isDown: computed(() => status.value === 'down'),
        isRetrying: computed(() => isRetrying.value),
        retry: retryBackend
    };
}

/** Test seam: clears the module-level state. */
export function resetBackendHealth(): void {
    status.value = 'healthy';
    consecutiveFailures.value = 0;
    firstFailureAt.value = null;
    isRetrying.value = false;
    options = { ...DEFAULTS };
    recoveryHandlers.clear();
}
