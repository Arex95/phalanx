import { effectScope } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import {
    ActionCancelledError,
    defaultNotify,
    defaultRequestConfirmation,
    withActionBehaviour,
    type AnyMutation
} from './actionBehaviour';
import type { ActionMeta } from './defineAction';

function fakeMutation(): AnyMutation {
    return {
        mutate: vi.fn(),
        mutateAsync: vi.fn().mockResolvedValue('ok')
    } as unknown as AnyMutation;
}

function injectionWith(overrides: Partial<Parameters<typeof withActionBehaviour>[2]> = {}) {
    return {
        checkPermission: () => true,
        requestConfirmation: defaultRequestConfirmation,
        translate: (key: string) => key,
        notify: () => undefined,
        ...overrides
    };
}

describe('withActionBehaviour', () => {
    it('does not gate mutate/mutateAsync when requiresConfirmation is not set', () => {
        const mutation = fakeMutation();
        const meta: ActionMeta = { permission: 'x.y.z' };
        const result = withActionBehaviour(mutation, meta, injectionWith(), effectScope());

        result.mutate!('args');
        expect(mutation.mutate).toHaveBeenCalledWith('args');
    });

    // Regression test for a real bug: `ActionAugment`'s type promises
    // `mutateWithoutConfirmation`/`mutateAsyncWithoutConfirmation` are ALWAYS
    // present for any `.meta`-carrying method — but the first implementation
    // only populated them in the `requiresConfirmation: true` branch, making
    // the type a lie for every action that only declares `permission`.
    it('exposes mutateWithoutConfirmation/mutateAsyncWithoutConfirmation even when confirmation is not required', () => {
        const mutation = fakeMutation();
        const meta: ActionMeta = { permission: 'x.y.z' };
        const result = withActionBehaviour(mutation, meta, injectionWith(), effectScope());

        expect(result.mutateWithoutConfirmation).toBe(mutation.mutate);
        expect(result.mutateAsyncWithoutConfirmation).toBe(mutation.mutateAsync);
    });

    it('gates mutate behind confirmation, firing the raw mutate only on accept', () => {
        const mutation = fakeMutation();
        const meta: ActionMeta = { requiresConfirmation: true };
        const requestConfirmation = vi.fn((_req, onAccept: () => void) => onAccept());
        const result = withActionBehaviour(mutation, meta, injectionWith({ requestConfirmation }), effectScope());

        result.mutate!('args');
        expect(requestConfirmation).toHaveBeenCalledOnce();
        expect(mutation.mutate).toHaveBeenCalledWith('args', undefined);
    });

    it('does not fire mutate when the confirmation is declined', () => {
        const mutation = fakeMutation();
        const meta: ActionMeta = { requiresConfirmation: true };
        const requestConfirmation = vi.fn(() => {
            // Never calls onAccept — the user declined.
        });
        const result = withActionBehaviour(mutation, meta, injectionWith({ requestConfirmation }), effectScope());

        result.mutate!('args');
        expect(mutation.mutate).not.toHaveBeenCalled();
    });

    // Regression test for a real, confirmed bug: the first implementation
    // only wrapped `mutate`, leaving `mutateAsync` as the raw, ungated
    // function via the object spread — a caller using `mutateAsync` on a
    // `requiresConfirmation: true` action fired immediately, no dialog.
    it('gates mutateAsync behind confirmation the same way as mutate', async () => {
        const mutation = fakeMutation();
        const meta: ActionMeta = { requiresConfirmation: true };
        const requestConfirmation = vi.fn((_req, onAccept: () => void) => onAccept());
        const result = withActionBehaviour(mutation, meta, injectionWith({ requestConfirmation }), effectScope());

        const value = await result.mutateAsync!('args');
        expect(requestConfirmation).toHaveBeenCalledOnce();
        expect(mutation.mutateAsync).toHaveBeenCalledWith('args', undefined);
        expect(value).toBe('ok');
    });

    // Regression test: without `onReject`, declining the confirmation left
    // the `mutateAsync` promise unsettled forever — a real hang, not just a
    // missing feature. `ActionCancelledError` is how it's supposed to settle.
    it('rejects mutateAsync with ActionCancelledError when the user declines', async () => {
        const mutation = fakeMutation();
        const meta: ActionMeta = { requiresConfirmation: true };
        const requestConfirmation = vi.fn((_req, _onAccept: () => void, onReject?: () => void) => onReject?.());
        const result = withActionBehaviour(mutation, meta, injectionWith({ requestConfirmation }), effectScope());

        await expect(result.mutateAsync!('args')).rejects.toBeInstanceOf(ActionCancelledError);
        expect(mutation.mutateAsync).not.toHaveBeenCalled();
    });

    it('isAuthorized reflects checkPermission for the declared permission', () => {
        const mutation = fakeMutation();
        const meta: ActionMeta = { permission: 'appointment.update' };
        const checkPermission = vi.fn((p: string) => p === 'appointment.update');
        const result = withActionBehaviour(mutation, meta, injectionWith({ checkPermission }), effectScope());

        expect(result.isAuthorized!.value).toBe(true);
        expect(checkPermission).toHaveBeenCalledWith('appointment.update');
    });

    it('isAuthorized is true when no permission is declared', () => {
        const mutation = fakeMutation();
        const result = withActionBehaviour(mutation, {}, injectionWith({ checkPermission: () => false }), effectScope());

        expect(result.isAuthorized!.value).toBe(true);
    });
});

describe('defaultRequestConfirmation', () => {
    it('calls onAccept when window.confirm returns true', () => {
        vi.stubGlobal('confirm', vi.fn(() => true));
        const onAccept = vi.fn();
        const onReject = vi.fn();

        defaultRequestConfirmation({ message: 'sure?' }, onAccept, onReject);

        expect(onAccept).toHaveBeenCalledOnce();
        expect(onReject).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
    });

    it('calls onReject when window.confirm returns false', () => {
        vi.stubGlobal('confirm', vi.fn(() => false));
        const onAccept = vi.fn();
        const onReject = vi.fn();

        defaultRequestConfirmation({ message: 'sure?' }, onAccept, onReject);

        expect(onAccept).not.toHaveBeenCalled();
        expect(onReject).toHaveBeenCalledOnce();
        vi.unstubAllGlobals();
    });
});

describe('defaultNotify', () => {
    it('logs errors via console.error', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        defaultNotify({ severity: 'error', message: 'failed' });
        expect(spy).toHaveBeenCalledWith('[action] failed');
        spy.mockRestore();
    });

    it('logs success via console.info', () => {
        const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        defaultNotify({ severity: 'success', message: 'done' });
        expect(spy).toHaveBeenCalledWith('[action] done');
        spy.mockRestore();
    });
});

describe('withActionBehaviour — confirmation message defaults', () => {
    it('falls back to a generic translated message and no header when confirmMessageKey/confirmHeaderKey are not set', () => {
        const mutation = fakeMutation();
        const meta: ActionMeta = { requiresConfirmation: true };
        const translate = vi.fn((k: string) => `t:${k}`);
        const requestConfirmation = vi.fn();
        const result = withActionBehaviour(
            mutation,
            meta,
            injectionWith({ requestConfirmation, translate }),
            effectScope()
        );

        result.mutate!('args');
        expect(requestConfirmation).toHaveBeenCalledWith(
            { message: 't:common.confirm.message', header: undefined, extra: undefined },
            expect.any(Function)
        );
    });

    it('uses confirmMessageKey/confirmHeaderKey when provided', () => {
        const mutation = fakeMutation();
        const meta: ActionMeta = {
            requiresConfirmation: true,
            confirmMessageKey: 'x.msg',
            confirmHeaderKey: 'x.header'
        };
        const translate = vi.fn((k: string) => `t:${k}`);
        const requestConfirmation = vi.fn();
        const result = withActionBehaviour(
            mutation,
            meta,
            injectionWith({ requestConfirmation, translate }),
            effectScope()
        );

        result.mutate!('args');
        expect(requestConfirmation).toHaveBeenCalledWith(
            { message: 't:x.msg', header: 't:x.header', extra: undefined },
            expect.any(Function)
        );
    });
});
