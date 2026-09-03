import { ref, type Ref } from 'vue';

/** Header carrying the key. The name is fixed by convention, not by a spec. */
export const IDEMPOTENCY_HEADER = 'Idempotency-Key';

/**
 * A random key for one logical operation. Uses `crypto.randomUUID` where it
 * exists and falls back to a v4-shaped string elsewhere — the fallback is not
 * cryptographically strong, which is acceptable because the key only needs to
 * be unique, not unguessable.
 */
export function generateIdempotencyKey(): string {
    const webCrypto = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
    if (webCrypto && typeof webCrypto.randomUUID === 'function') {
        return webCrypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

export interface UseIdempotencyKeyOptions {
    /** Namespaces the stored key, so two forms do not share one. */
    scope: string;
    /**
     * Keep the key in `sessionStorage` so a reload mid-submission reuses it
     * rather than creating a second resource. Default `true`.
     */
    persist?: boolean;
}

export interface UseIdempotencyKeyReturn {
    key: Ref<string | null>;
    /** The current key, generating one on first call. */
    ensure: () => string;
    /** Discards the current key and returns a new one. Call after a success. */
    rotate: () => string;
    clear: () => void;
}

function storageKey(scope: string): string {
    return `idempotency:${scope}`;
}

/**
 * One ref per scope, shared by every caller.
 *
 * A ref per call site looked equivalent and was not: two components on the same
 * scope wrote to one storage slot but read from separate refs, so rotating in
 * one left the other showing a key that no longer existed. The point of the
 * scope is that they agree.
 */
const scopes = new Map<string, Ref<string | null>>();

function readStored(scope: string): string | null {
    try {
        return globalThis.sessionStorage?.getItem(storageKey(scope)) ?? null;
    } catch {
        // Private mode and storage-blocking browsers throw on access rather
        // than returning null. A missing key is not an error here.
        return null;
    }
}

function writeStored(scope: string, value: string | null): void {
    try {
        if (value === null) globalThis.sessionStorage?.removeItem(storageKey(scope));
        else globalThis.sessionStorage?.setItem(storageKey(scope), value);
    } catch {
        // Same reasoning: losing persistence degrades the guarantee to
        // "unique per page load", it does not break the caller.
    }
}

/**
 * Holds one idempotency key for a form or wizard, so that a double submit — or
 * a retry after a timeout — reaches the API as the same operation.
 *
 * ```ts
 * const idem = useIdempotencyKey({ scope: 'appointment-create' });
 * await AppointmentService.create({
 *     data,
 *     headers: { [IDEMPOTENCY_HEADER]: idem.ensure() }
 * });
 * idem.rotate();
 * ```
 */
export function useIdempotencyKey(options: UseIdempotencyKeyOptions): UseIdempotencyKeyReturn {
    const persist = options.persist ?? true;

    let existing = scopes.get(options.scope);
    if (!existing) {
        existing = ref<string | null>(persist ? readStored(options.scope) : null);
        scopes.set(options.scope, existing);
    }
    const key = existing;

    function rotate(): string {
        const next = generateIdempotencyKey();
        key.value = next;
        if (persist) writeStored(options.scope, next);
        return next;
    }

    function ensure(): string {
        return key.value ?? rotate();
    }

    function clear(): void {
        key.value = null;
        if (persist) writeStored(options.scope, null);
    }

    return { key, ensure, rotate, clear };
}

/** Test seam: forgets every scope held in memory. Storage is left alone. */
export function resetIdempotencyScopes(): void {
    scopes.clear();
}
