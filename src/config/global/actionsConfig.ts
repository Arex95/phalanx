import { shallowRef } from 'vue';
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
/**
 * Reactive, and deliberately so. The four are read where they are used rather
 * than captured when a domain object is built, so registering them after a
 * domain exists still takes effect — and `isAuthorized`, a `computed`, tracks
 * this ref and re-evaluates instead of caching a verdict reached before the
 * permission check was known.
 *
 * That ordering used to matter, silently and in the dangerous direction: the
 * default permission check is `() => true`, so every gated action in every
 * domain built before `configActions` ran was authorized. The button rendered
 * and the action fired; only the server refused. Making this reactive removes
 * the ordering constraint rather than documenting it.
 */
const actionsConfig = shallowRef<ActionInjection>({});

export function configActions(config: ActionInjection): void {
    actionsConfig.value = { ...config };
}

export function getActionsConfig(): ActionInjection {
    return actionsConfig.value;
}

/** Test seam: forgets the registered defaults. */
export function resetActionsConfig(): void {
    actionsConfig.value = {};
}
