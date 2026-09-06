import type { ActionInjection } from '@/actions/actionBehaviour';

/**
 * Application-wide defaults for the four functions an action's behaviour needs:
 * the permission check, the confirmation dialog, the translator and the
 * notifier.
 *
 * They were reachable only through `createDomainMutations`'s config, which made
 * every domain restate the same four — one panel reported repeating them across
 * seventeen composables, or writing a local wrapper whose only job was
 * pre-filling them. They are policy, and a panel has one of each.
 *
 * A per-call config still wins, function by function: a module that needs its
 * own confirmation dialog overrides that one and inherits the rest.
 *
 * Like the other configuration here this is module-level state — one set per
 * process. Correct in a browser, wrong in SSR request handling.
 */
let actionsConfig: ActionInjection = {};

export function configActions(config: ActionInjection): void {
    actionsConfig = { ...config };
}

export function getActionsConfig(): ActionInjection {
    return actionsConfig;
}

/** Test seam: forgets the registered defaults. */
export function resetActionsConfig(): void {
    actionsConfig = {};
}
