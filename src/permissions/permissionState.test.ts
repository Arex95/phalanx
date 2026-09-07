import { afterEach, describe, expect, it, vi } from 'vitest';
import { computed, effectScope, nextTick } from 'vue';
import { configActions, resetActionsConfig } from '@config/global/actionsConfig';
import {
    can,
    canAll,
    canAny,
    canAnyAsync,
    canAsync,
    isPermissionPending,
    resetPermissionCache,
    verdict
} from './permissionState';

afterEach(() => {
    resetActionsConfig();
    resetPermissionCache();
});

/** Resolves on demand, so a test can observe the pending window. */
function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => (resolve = r));
    return { promise, resolve };
}

describe('can', () => {
    it('uses the check registered through configActions', () => {
        configActions({ checkPermission: (p) => p === 'users.read' });
        expect(can('users.read')).toBe(true);
        expect(can('users.write')).toBe(false);
    });

    it('permits everything when no check is registered', () => {
        // The library does not invent a permission system for a consumer who
        // has not wired one; denying here would break every unconfigured app.
        expect(can('anything')).toBe(true);
    });

    it('answers a permission once, however many times it is asked', () => {
        const checkPermission = vi.fn(() => true);
        configActions({ checkPermission });

        for (let i = 0; i < 50; i++) can('users.read');
        expect(checkPermission).toHaveBeenCalledTimes(1);
    });

    it('forgets its answers when the check is replaced', () => {
        configActions({ checkPermission: () => true });
        expect(can('users.read')).toBe(true);

        configActions({ checkPermission: () => false });
        expect(can('users.read')).toBe(false);
    });

    it('canAny and canAll compose it, and an empty list is not a grant', () => {
        configActions({ checkPermission: (p) => p === 'a' });
        expect(canAny(['a', 'b'])).toBe(true);
        expect(canAny(['b', 'c'])).toBe(false);
        expect(canAll(['a', 'b'])).toBe(false);
        expect(canAll(['a'])).toBe(true);
        expect(canAny([])).toBe(false);
    });
});

describe('an asynchronous check', () => {
    it('is denied while pending, not authorized', async () => {
        // The defect this exists to prevent: a pending `Promise` is truthy, so
        // reading the check's return value directly authorizes everything.
        const gate = deferred<boolean>();
        configActions({ checkPermission: () => gate.promise });

        expect(can('users.delete')).toBe(false);
        expect(isPermissionPending('users.delete')).toBe(true);

        gate.resolve(true);
        await gate.promise;
        expect(can('users.delete')).toBe(true);
        expect(isPermissionPending('users.delete')).toBe(false);
    });

    it('reaches a computed that already read it', async () => {
        const gate = deferred<boolean>();
        configActions({ checkPermission: () => gate.promise });

        const scope = effectScope();
        const allowed = scope.run(() => computed(() => can('users.delete')))!;

        expect(allowed.value).toBe(false);
        gate.resolve(true);
        await gate.promise;
        await nextTick();
        expect(allowed.value).toBe(true);

        scope.stop();
    });

    it('is asked once even while still pending', async () => {
        const gate = deferred<boolean>();
        const checkPermission = vi.fn(() => gate.promise);
        configActions({ checkPermission });

        for (let i = 0; i < 20; i++) can('users.delete');
        expect(checkPermission).toHaveBeenCalledTimes(1);

        gate.resolve(true);
        await gate.promise;
    });

    it('denies when the check rejects', async () => {
        configActions({ checkPermission: () => Promise.reject(new Error('offline')) });
        // Failing open would render a control the user may not have.
        await expect(canAsync('users.delete')).resolves.toBe(false);
        expect(can('users.delete')).toBe(false);
    });

    it('canAsync waits for the verdict instead of guessing', async () => {
        const gate = deferred<boolean>();
        configActions({ checkPermission: () => gate.promise });

        const settled = canAsync('users.delete');
        gate.resolve(true);
        await expect(settled).resolves.toBe(true);
    });

    it('canAnyAsync resolves the list in parallel', async () => {
        const started: string[] = [];
        configActions({
            checkPermission: (p) => {
                started.push(p);
                return Promise.resolve(p === 'b');
            }
        });

        const settled = canAnyAsync(['a', 'b']);
        // Both lookups begin before either resolves — a sequential
        // implementation would have started only 'a' by now.
        expect(started).toEqual(['a', 'b']);
        await expect(settled).resolves.toBe(true);
    });

    it('does not resurrect a verdict for a check that has been replaced', async () => {
        const gate = deferred<boolean>();
        configActions({ checkPermission: () => gate.promise });
        expect(can('users.delete')).toBe(false);

        configActions({ checkPermission: () => false });
        gate.resolve(true);
        await gate.promise;

        // The `true` belongs to a source nobody is using any more.
        expect(can('users.delete')).toBe(false);
    });
});

describe('verdict, against a check that is not the registered one', () => {
    it('keeps a domain-injected check separate from the global one', () => {
        configActions({ checkPermission: () => false });
        const own = () => true;

        // A domain that injects its own check must not read the application's
        // cached answers, nor write into them.
        expect(verdict(own, 'users.read')).toBe(true);
        expect(can('users.read')).toBe(false);
    });
});
