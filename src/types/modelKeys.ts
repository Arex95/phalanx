import type { BaseModelKeys } from './domain';

/** The five a domain always has. */
const BASE = ['list', 'item', 'selected', 'collection', 'filter'] as const;

export type ModelKeys<TExtra extends string = never> = BaseModelKeys &
    Record<TExtra, string> &
    // The index signature is what the composables' `keys` accepts, since a
    // custom method's cache key is looked up by that method's name. Its cost is
    // that reading an undeclared key type-checks and yields `string | undefined`
    // rather than erroring — the strings are generated correctly either way,
    // which is what this function is for.
    Record<string, string | undefined>;

/**
 * Builds a domain's cache keys from one namespace.
 *
 * ```ts
 * const userKeys = createModelKeys('admin:user');
 * // { list: 'admin:user:list', item: 'admin:user:item', … }
 * ```
 *
 * The five are required and always the same, so writing them out is five
 * chances to typo a string that no compiler checks and that fails silently:
 * a mutation succeeds while the list keeps showing stale rows, with no error
 * and no failing test.
 *
 * Extra keys are named, not spelled — the namespace is applied for you:
 *
 * ```ts
 * const userKeys = createModelKeys('admin:user', ['archived', 'pending']);
 * userKeys.archived; // 'admin:user:archived', and typed
 * ```
 *
 * Nothing here is mandatory. A domain with keys that do not follow one prefix
 * still declares the object by hand; this only removes the case where they do.
 */
export function createModelKeys<const TExtra extends readonly string[] = []>(
    namespace: string,
    extras?: TExtra
): ModelKeys<TExtra[number]> {
    const prefix = namespace.trim().replace(/:+$/, '');
    if (!prefix) {
        throw new Error('[phalanx] createModelKeys needs a namespace — it becomes the key prefix.');
    }

    const clash = extras?.find((name) => (BASE as readonly string[]).includes(name));
    if (clash) {
        // Silently overwriting `list` would produce exactly the bug this
        // function exists to prevent, so it is refused rather than merged.
        throw new Error(
            `[phalanx] '${clash}' is one of the five base keys and cannot be redeclared as an extra.`
        );
    }

    const keys: Record<string, string> = {};
    for (const name of [...BASE, ...(extras ?? [])]) {
        keys[name] = `${prefix}:${name}`;
    }
    return keys as ModelKeys<TExtra[number]>;
}
