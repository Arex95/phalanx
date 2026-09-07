import { afterEach, describe, expect, it, vi } from 'vitest';
import { configActions, resetActionsConfig } from '@config/global/actionsConfig';
import { resetPermissionCache } from './permissionState';
import { createPermissionGuard } from './routeGuard';

afterEach(() => {
    resetActionsConfig();
    resetPermissionCache();
});

/** The shape vue-router hands a guard, reduced to what this reads. */
const route = (permission?: unknown, parents: unknown[] = []) => ({
    meta: permission === undefined ? {} : { permission },
    matched: [...parents.map((p) => ({ meta: { permission: p } })), { meta: { permission } }]
});

describe('createPermissionGuard', () => {
    it('allows a route that declares no requirement', async () => {
        configActions({ checkPermission: () => false });
        const guard = createPermissionGuard();
        // This guard answers about permissions. A route with none has none —
        // whatever else gates it is the consumer's business.
        await expect(guard({ meta: {} })).resolves.toBe(true);
    });

    it('reads meta.permission and refuses when it is not held', async () => {
        configActions({ checkPermission: (p) => p === 'users.index' });
        const guard = createPermissionGuard();

        await expect(guard(route('users.index'))).resolves.toBe(true);
        await expect(guard(route('users.destroy'))).resolves.toBe(false);
    });

    it('treats a list as any-of', async () => {
        configActions({ checkPermission: (p) => p === 'entries.index_own' });
        const guard = createPermissionGuard();

        // 'index or index_own' is how a scoped-read route is usually written.
        await expect(
            guard(route(['entries.index', 'entries.index_own']))
        ).resolves.toBe(true);
        await expect(guard(route(['entries.index', 'entries.export']))).resolves.toBe(false);
    });

    it('waits for an asynchronous verdict rather than entering optimistically', async () => {
        let release!: (allowed: boolean) => void;
        const gate = new Promise<boolean>((r) => (release = r));
        configActions({ checkPermission: () => gate });

        const guard = createPermissionGuard();
        const verdict = guard(route('users.index'));

        let settled = false;
        void verdict.then(() => (settled = true));
        await Promise.resolve();
        // Still undecided: entering here would render the page before the
        // answer, which is the whole reason this is async.
        expect(settled).toBe(false);

        release(true);
        await expect(verdict).resolves.toBe(true);
    });

    it('inherits a parent requirement, so a child of a protected section is protected', async () => {
        configActions({ checkPermission: (p) => p === 'admin.section' });
        const guard = createPermissionGuard();

        // Parent requires something held, leaf requires something else.
        await expect(guard(route('admin.reports', ['admin.section']))).resolves.toBe(false);
        // Parent requires something not held, leaf is open.
        await expect(guard(route(undefined, ['admin.locked']))).resolves.toBe(false);
        await expect(guard(route('admin.section', ['admin.section']))).resolves.toBe(true);
    });

    it('reads only the leaf when inheritance is turned off', async () => {
        configActions({ checkPermission: (p) => p === 'leaf' });
        const guard = createPermissionGuard({ inherit: false });
        await expect(guard(route('leaf', ['unheld.parent']))).resolves.toBe(true);
    });

    it('accepts a different field, so the convention is not ours to fix', async () => {
        configActions({ checkPermission: (p) => p === 'x.read' });
        const guard = createPermissionGuard({
            read: (r) => r.meta?.requires as string | undefined
        });
        await expect(guard({ meta: { requires: 'x.read' } })).resolves.toBe(true);
        await expect(guard({ meta: { requires: 'x.write' } })).resolves.toBe(false);
    });

    it('ignores a malformed requirement instead of throwing mid-navigation', async () => {
        configActions({ checkPermission: () => false });
        const guard = createPermissionGuard();
        // A number or a mixed array is a mistake, but blowing up inside a
        // navigation guard turns it into a blank screen with no route.
        await expect(guard({ meta: { permission: 42 } })).resolves.toBe(true);
        await expect(guard({ meta: { permission: ['ok', 7] } })).resolves.toBe(true);
    });

    it('asks the permission system once for a route entered repeatedly', async () => {
        const checkPermission = vi.fn(() => true);
        configActions({ checkPermission });
        const guard = createPermissionGuard();

        await guard(route('users.index'));
        await guard(route('users.index'));
        await guard(route('users.index'));
        expect(checkPermission).toHaveBeenCalledTimes(1);
    });
});
