import { computed, shallowRef, triggerRef, type ComputedRef } from 'vue';
import { getActionsConfig } from '@config/global/actionsConfig';

export type PermissionCheck = (permission: string) => boolean | Promise<boolean>;

type Entry = { settled: true; allowed: boolean } | { settled: false; promise: Promise<boolean> };

/**
 * One answer per permission, per check function.
 *
 * Keyed by the check itself rather than by a global epoch: a domain may inject
 * its own `checkPermission`, and its verdicts are not the application's. It
 * also means a re-registration through `configActions` — which stores a fresh
 * object holding, usually, a fresh closure — starts from an empty bucket
 * instead of answering from the source it replaced, without the two modules
 * having to import each other.
 */
const buckets = new WeakMap<PermissionCheck, Map<string, Entry>>();

/**
 * Bumped whenever a verdict lands. `computed`s read it, so an answer that
 * arrives after the first render reaches whatever already asked — a `WeakMap`
 * cannot be reactive on its own.
 */
const version = shallowRef(0);

/** Test seam: forgets every verdict, for every check. */
export function resetPermissionCache(): void {
    for (const check of tracked) buckets.delete(check);
    tracked.clear();
    version.value++;
}

/** Only so `resetPermissionCache` can reach buckets a `WeakMap` will not list. */
const tracked = new Set<PermissionCheck>();

function bucketFor(check: PermissionCheck): Map<string, Entry> {
    let bucket = buckets.get(check);
    if (!bucket) {
        bucket = new Map();
        buckets.set(check, bucket);
        tracked.add(check);
    }
    return bucket;
}

/**
 * The cached verdict for one permission under one check, starting the lookup
 * if it has not been made.
 *
 * Exported for `withActionBehaviour`, which resolves against the check its
 * domain was given rather than the globally registered one. Reading the
 * promise's truthiness instead of awaiting it is the bug this exists to make
 * impossible: a pending `Promise` is truthy, so an asynchronous check used
 * naively authorizes everything.
 */
export function resolvePermission(
    check: PermissionCheck | undefined,
    permission: string
): Entry | undefined {
    // Touch the version so every caller re-evaluates when a verdict lands.
    void version.value;
    if (!check) return undefined;

    const bucket = bucketFor(check);
    const cached = bucket.get(permission);
    if (cached) return cached;

    const outcome = check(permission);

    if (typeof outcome === 'boolean') {
        const entry: Entry = { settled: true, allowed: outcome };
        bucket.set(permission, entry);
        return entry;
    }

    const promise = Promise.resolve(outcome).then(
        (allowed) => {
            settle(bucket, permission, allowed);
            return allowed;
        },
        () => {
            // A check that throws denies. Failing open would render a control
            // the user may not have, which is the worse direction to fail in.
            settle(bucket, permission, false);
            return false;
        }
    );

    const pending: Entry = { settled: false, promise };
    bucket.set(permission, pending);
    return pending;
}

function settle(bucket: Map<string, Entry>, permission: string, allowed: boolean): void {
    // The bucket may have been dropped in the meantime; writing back would
    // resurrect a verdict from a source that is no longer registered.
    if (!bucket.has(permission)) return;
    bucket.set(permission, { settled: true, allowed });
    version.value++;
    triggerRef(version);
}

/** `true` once allowed, `false` while pending or denied. */
export function verdict(check: PermissionCheck | undefined, permission: string): boolean {
    const entry = resolvePermission(check, permission);
    if (!entry) return true;
    return entry.settled ? entry.allowed : false;
}

/** Whether that verdict is still being fetched. */
export function pending(check: PermissionCheck | undefined, permission: string): boolean {
    const entry = resolvePermission(check, permission);
    return entry ? !entry.settled : false;
}

/**
 * Whether the current user holds a permission, using the check registered
 * through `configActions`.
 *
 * The same source the action buttons use, reachable without constructing a
 * domain object — for a route guard, a menu item, or any check with no
 * mutation attached. Reading it from here rather than reimplementing it is
 * what stops a button and the route behind it from disagreeing.
 *
 * Synchronous by design. If the registered check returns a promise this is
 * `false` until it settles — denied, not "maybe" — and a surrounding
 * `computed` re-evaluates when the answer lands. Pair it with
 * `isPermissionPending` to tell "no" apart from "not yet".
 *
 * With no check registered everything is permitted: the library does not
 * invent a permission system for a consumer that has not wired one.
 */
export function can(permission: string): boolean {
    return verdict(getActionsConfig().checkPermission, permission);
}

/** True when any one of them is held. An empty list is not a grant. */
export function canAny(permissions: readonly string[]): boolean {
    return permissions.some((permission) => can(permission));
}

/** True when every one of them is held. An empty list is vacuously true. */
export function canAll(permissions: readonly string[]): boolean {
    return permissions.every((permission) => can(permission));
}

/**
 * Whether a verdict is still being fetched. Always `false` for a synchronous
 * check, which is why a consumer that never returns a promise pays nothing.
 */
export function isPermissionPending(permission: string): boolean {
    return pending(getActionsConfig().checkPermission, permission);
}

/** Reactive `can`, for a template that should re-render when a verdict lands. */
export function usePermission(permission: string): {
    allowed: ComputedRef<boolean>;
    isPending: ComputedRef<boolean>;
} {
    return {
        allowed: computed(() => can(permission)),
        isPending: computed(() => isPermissionPending(permission))
    };
}

/**
 * The verdict, waiting for it when the registered check is asynchronous.
 *
 * For somewhere that can afford to wait and must not guess — a navigation
 * guard deciding whether to enter a route. Everywhere else prefers `can`,
 * which answers now and corrects itself.
 */
export async function canAsync(permission: string): Promise<boolean> {
    const entry = resolvePermission(getActionsConfig().checkPermission, permission);
    if (!entry) return true;
    return entry.settled ? entry.allowed : entry.promise;
}

/** `canAsync` for a list, true when any one is held. Resolved in parallel. */
export async function canAnyAsync(permissions: readonly string[]): Promise<boolean> {
    if (permissions.length === 0) return false;
    const verdicts = await Promise.all(permissions.map((p) => canAsync(p)));
    return verdicts.some(Boolean);
}
