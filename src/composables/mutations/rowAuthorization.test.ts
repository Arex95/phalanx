import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { createDomainMutations } from './createDomainMutations';
import { configActions, resetActionsConfig } from '@config/global/actionsConfig';
import { defineAction } from '@/actions';
import { createPermissions } from '@/types/permissions';
import type { RestStdService } from '@/types';

/**
 * The gap that made the `permission` field unusable in practice.
 *
 * A panel that had fully adopted the actions layer declared 52 permissions and
 * routed none of them through `defineAction`. The reason was measurable rather
 * than a preference: `isAuthorized` answers once for the whole domain, and a
 * table needs one verdict per row — an entry already notified cannot be
 * notified again. So the permission string was restated by hand beside the row
 * condition, in a second place, free to drift.
 *
 * `isAuthorizedFor(record)` composes the two halves. These pin that the
 * permission half is shared and reactive while the record half is per row.
 */
const Perms = createPermissions('Waitlist.entries', ['notify']);

const keys = {
    list: 'waitlist:list',
    item: 'waitlist:item',
    selected: 'waitlist:selected',
    collection: 'waitlist:collection',
    filter: 'waitlist:filter'
};

/** The rule lives on the model, which is the documented placement. */
class Entry {
    status: string;
    constructor(status: string) {
        this.status = status;
    }
    get canBeNotified() {
        return this.status === 'pending';
    }
}

function service(meta: Record<string, unknown>) {
    return {
        resource: 'waitlist',
        getAll: vi.fn(),
        getOne: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
        notify: defineAction(async () => ({ ok: true }), meta)
    } as unknown as RestStdService;
}

type Gated = {
    notify: {
        isAuthorized: { value: boolean };
        isAuthorizationPending: { value: boolean };
        isAuthorizedFor: (record: unknown) => boolean;
    };
};

function build(meta: Record<string, unknown>) {
    let domain!: Gated;
    const app = createApp({
        setup() {
            domain = createDomainMutations({ service: service(meta), keys }) as unknown as Gated;
            return () => null;
        }
    });
    app.use(VueQueryPlugin, { queryClient: new QueryClient() });
    app.mount(document.createElement('div'));
    return { domain, unmount: () => app.unmount() };
}

let harness: { unmount: () => void } | undefined;
afterEach(() => {
    harness?.unmount();
    harness = undefined;
    resetActionsConfig();
});

describe('isAuthorizedFor', () => {
    it('answers per row, where isAuthorized answers once', () => {
        resetActionsConfig();
        configActions({ checkPermission: (p) => p === Perms.notify });

        const h = build({ permission: Perms.notify, allowedWhen: (e: Entry) => e.canBeNotified });
        harness = h;

        // One verdict for the user…
        expect(h.domain.notify.isAuthorized.value).toBe(true);

        // …and a different verdict per row.
        expect(h.domain.notify.isAuthorizedFor(new Entry('pending'))).toBe(true);
        expect(h.domain.notify.isAuthorizedFor(new Entry('notified'))).toBe(false);
        expect(h.domain.notify.isAuthorizedFor(new Entry('withdrawn'))).toBe(false);
    });

    it('denies every row when the permission is missing, whatever the row says', () => {
        resetActionsConfig();
        configActions({ checkPermission: () => false });

        const h = build({ permission: Perms.notify, allowedWhen: (e: Entry) => e.canBeNotified });
        harness = h;

        expect(h.domain.notify.isAuthorized.value).toBe(false);
        // The row qualifies and is still refused: permission is not optional.
        expect(h.domain.notify.isAuthorizedFor(new Entry('pending'))).toBe(false);
    });

    it('checks the permission once per verdict, not once per row', () => {
        resetActionsConfig();
        const checkPermission = vi.fn(() => true);
        configActions({ checkPermission });

        const h = build({ permission: Perms.notify, allowedWhen: (e: Entry) => e.canBeNotified });
        harness = h;

        const rows = Array.from({ length: 50 }, () => new Entry('pending'));
        rows.forEach((row) => h.domain.notify.isAuthorizedFor(row));

        // The permission half is a `computed` shared by every row: 50 rows
        // must not mean 50 calls into the consumer's permission system.
        expect(checkPermission.mock.calls.length).toBeLessThan(rows.length);
    });

    it('falls back to the permission alone when no row rule is declared', () => {
        resetActionsConfig();
        configActions({ checkPermission: () => true });

        const h = build({ permission: Perms.notify });
        harness = h;

        expect(h.domain.notify.isAuthorizedFor(new Entry('notified'))).toBe(true);
        expect(h.domain.notify.isAuthorizedFor(undefined)).toBe(true);
    });

    it('applies the row rule when no permission is declared', () => {
        resetActionsConfig();

        const h = build({ allowedWhen: (e: Entry) => e.canBeNotified });
        harness = h;

        // An action can be gated by state alone — not every operation is
        // permissioned, and the row rule must not require one.
        expect(h.domain.notify.isAuthorizedFor(new Entry('pending'))).toBe(true);
        expect(h.domain.notify.isAuthorizedFor(new Entry('notified'))).toBe(false);
    });

    it('tracks a permission registered after the domain was built', () => {
        resetActionsConfig();
        const h = build({ permission: Perms.notify, allowedWhen: (e: Entry) => e.canBeNotified });
        harness = h;

        configActions({ checkPermission: () => false });
        expect(h.domain.notify.isAuthorizedFor(new Entry('pending'))).toBe(false);

        configActions({ checkPermission: () => true });
        expect(h.domain.notify.isAuthorizedFor(new Entry('pending'))).toBe(true);
    });

    it('is denied, not authorized, while an async permission is pending', async () => {
        resetActionsConfig();
        let release!: (allowed: boolean) => void;
        const gate = new Promise<boolean>((r) => (release = r));
        configActions({ checkPermission: () => gate });

        const h = build({ permission: Perms.notify, allowedWhen: (e: Entry) => e.canBeNotified });
        harness = h;

        // The failure this prevents: a pending Promise is truthy, so a naive
        // read shows every gated control before the answer arrives.
        expect(h.domain.notify.isAuthorized.value).toBe(false);
        expect(h.domain.notify.isAuthorizationPending.value).toBe(true);
        expect(h.domain.notify.isAuthorizedFor(new Entry('pending'))).toBe(false);

        release(true);
        await gate;
        await nextTick();

        expect(h.domain.notify.isAuthorized.value).toBe(true);
        expect(h.domain.notify.isAuthorizationPending.value).toBe(false);
        expect(h.domain.notify.isAuthorizedFor(new Entry('pending'))).toBe(true);
        expect(h.domain.notify.isAuthorizedFor(new Entry('notified'))).toBe(false);
    });

    it('reports no pending state for a synchronous check', () => {
        resetActionsConfig();
        configActions({ checkPermission: () => true });
        const h = build({ permission: Perms.notify });
        harness = h;
        // A consumer who never returns a promise pays nothing for this.
        expect(h.domain.notify.isAuthorizationPending.value).toBe(false);
    });
});
