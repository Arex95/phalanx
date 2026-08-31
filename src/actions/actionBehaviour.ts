import { computed, type ComputedRef, type EffectScope } from 'vue';
import type { UseMutationReturnType } from '@tanstack/vue-query';
import type { ActionMeta } from './defineAction';

/**
 * Everything about enriching a mutation with permission-gating,
 * confirmation and notification — split out of `createDomainMutations`
 * because it is one concern, not the same one as wiring plain CRUD to
 * TanStack Query. An `Action` is not a different kind of thing from a
 * `Mutation`: it is any mutation — built-in CRUD or a custom named method —
 * carrying this enrichment. There is one mechanism here, reached from two
 * places: `defineAction`'s `.meta` on a custom Service method, or the
 * `actions` config map in `createDomainMutations` for `create`/`update`/
 * `patch`/`remove`, which have no per-service method to hang metadata on.
 */

export interface ConfirmationRequest {
    message: string;
    header?: string;
    extra?: Record<string, unknown>;
}

export interface NotifyRequest {
    severity: 'success' | 'error';
    message: string;
    extra?: Record<string, unknown>;
}

export interface ActionInjection {
    /**
     * Reads a permission string. Injected rather than assumed, so this
     * library never has an opinion on where permissions come from.
     */
    checkPermission?: (permission: string) => boolean;
    /**
     * Opens whatever confirmation UI the consumer wants and calls `onAccept`
     * if the user confirms, `onReject` if they decline. `onReject` is what
     * lets `mutateAsync` settle (as a rejection) instead of hanging forever
     * when the user cancels — `mutate` doesn't need it, since firing nothing
     * on cancel is already a valid, complete outcome for a void return.
     * Injected because this library must not assume a UI library. `extra`
     * is `meta.confirmOptions`, passed through untouched — whatever the
     * consumer's dialog understands, it gets, without this library having
     * to know what it is.
     *
     * Default: `window.confirm()`. A real, working confirmation with zero
     * dependencies, not a placeholder.
     */
    requestConfirmation?: (
        request: ConfirmationRequest,
        onAccept: () => void,
        onReject?: () => void
    ) => void;
    /**
     * Resolves an i18n key to display text. Default is the identity
     * function — the key itself is shown, which is honest when no i18n is
     * wired, not a silent failure.
     */
    translate?: (key: string) => string;
    /**
     * Fires after a mutation carrying `successMessageKey`/`errorMessageKey`
     * settles. Default logs to the console — visible, zero dependencies.
     */
    notify?: (request: NotifyRequest) => void;
}

export const defaultRequestConfirmation: NonNullable<ActionInjection['requestConfirmation']> = (
    request,
    onAccept,
    onReject
) => {
    if (window.confirm(request.header ? `${request.header}\n\n${request.message}` : request.message)) {
        onAccept();
    } else {
        onReject?.();
    }
};

/**
 * Thrown to reject a `mutateAsync()` call when the user declines the
 * confirmation dialog — distinguishable from a real request failure via
 * `instanceof`, for a caller that wants to tell the two apart.
 */
export class ActionCancelledError extends Error {
    constructor() {
        super('[phalanx] Action cancelled: confirmation was not accepted.');
        this.name = 'ActionCancelledError';
    }
}

export const identityTranslate = (key: string): string => key;

export const defaultNotify: NonNullable<ActionInjection['notify']> = (request) => {
    if (request.severity === 'error') {
        console.error(`[action] ${request.message}`);
    } else {
        console.info(`[action] ${request.message}`);
    }
};

export type AnyMutation = UseMutationReturnType<unknown, Error, unknown, unknown> & {
    isAuthorized?: ComputedRef<boolean>;
    mutateWithoutConfirmation?: UseMutationReturnType<unknown, Error, unknown, unknown>['mutate'];
    mutateAsyncWithoutConfirmation?: UseMutationReturnType<unknown, Error, unknown, unknown>['mutateAsync'];
};

/** `defineAction`-tagged methods carry `.meta` on the function type itself,
 * which is what makes this detectable at the type level. Both
 * `*WithoutConfirmation` fields are unconditionally required here — they
 * must be, for every `.meta`-carrying method, regardless of whether that
 * particular action declares `requiresConfirmation`. `withActionBehaviour`
 * has to populate both in every branch to keep that promise; leaving them
 * `undefined` when confirmation isn't required would make this type a lie
 * for exactly the actions that don't need the escape hatch. */
export type ActionAugment<TMethod, R, A> = TMethod extends { meta: ActionMeta }
    ? {
          isAuthorized: ComputedRef<boolean>;
          mutateWithoutConfirmation: UseMutationReturnType<R, Error, A, unknown>['mutate'];
          mutateAsyncWithoutConfirmation: UseMutationReturnType<R, Error, A, unknown>['mutateAsync'];
      }
    : Record<never, never>;

/**
 * Layers permission-gating and (when declared) a confirmation dialog around
 * a mutation whose `ActionMeta` came from either source above — without
 * touching how `mutate`/`mutateAsync` behave for anything that doesn't
 * opt in.
 */
export function withActionBehaviour(
    mutation: AnyMutation,
    meta: ActionMeta,
    injection: Required<ActionInjection>,
    ownerScope: EffectScope
): AnyMutation {
    return ownerScope.run(() => {
        const isAuthorized = computed(() =>
            meta.permission ? injection.checkPermission(meta.permission) : true
        );

        if (!meta.requiresConfirmation) {
            // No confirmation to bypass — both escape hatches are simply
            // aliases of the real thing, so the type promise made by
            // `ActionAugment` (always present for a `.meta`-carrying
            // method) holds regardless of whether this action needs one.
            return {
                ...mutation,
                isAuthorized,
                mutateWithoutConfirmation: mutation.mutate,
                mutateAsyncWithoutConfirmation: mutation.mutateAsync
            } as AnyMutation;
        }

        const rawMutate = mutation.mutate;
        const rawMutateAsync = mutation.mutateAsync;

        const confirmationRequest = (): ConfirmationRequest => ({
            message: meta.confirmMessageKey
                ? injection.translate(meta.confirmMessageKey)
                : injection.translate('common.confirm.message'),
            header: meta.confirmHeaderKey ? injection.translate(meta.confirmHeaderKey) : undefined,
            // Passed through untouched — nothing the consumer's
            // confirmation UI supports is unreachable from
            // `defineAction`'s config.
            extra: meta.confirmOptions
        });

        const mutate = (args: unknown, options?: unknown) => {
            injection.requestConfirmation(confirmationRequest(), () => rawMutate(args, options as never));
        };

        // Mirrors `mutate`'s gating, but must also handle decline: `mutate`
        // returns void, so doing nothing on cancel is already a complete
        // outcome. `mutateAsync`'s caller is holding a Promise — leaving it
        // unsettled on cancel would hang an `await` forever, so decline
        // rejects with `ActionCancelledError` instead.
        const mutateAsync = (args: unknown, options?: unknown) => {
            return new Promise((resolve, reject) => {
                injection.requestConfirmation(
                    confirmationRequest(),
                    () => rawMutateAsync(args, options as never).then(resolve, reject),
                    () => reject(new ActionCancelledError())
                );
            });
        };

        // The auto-confirming `mutate`/`mutateAsync` are the default
        // because most call sites want them, not because they are the only
        // way to fire this mutation. `mutateWithoutConfirmation` is the
        // same mutation, unwrapped, for a caller that already confirmed
        // once — a bulk action, a flow with its own review step.
        return {
            ...mutation,
            isAuthorized,
            mutate,
            mutateAsync,
            mutateWithoutConfirmation: rawMutate,
            mutateAsyncWithoutConfirmation: rawMutateAsync
        } as AnyMutation;
    }) as AnyMutation;
}
