/** The five a CRUD resource always has. */
const BASE = ['index', 'view', 'create', 'update', 'delete'] as const;

export type BasePermissions = Record<(typeof BASE)[number], string>;

export type Permissions<TExtra extends string = never> = BasePermissions &
    Record<TExtra, string>;

export interface CreatePermissionsOptions {
    /**
     * What joins the prefix to the action. Defaults to `'.'`, the shape most
     * back ends use (`Catalog.work_types.create`). A vocabulary that separates
     * differently says so here rather than giving up the helper.
     */
    separator?: string;
}

/**
 * Builds a module's permission strings from one prefix.
 *
 * ```ts
 * // entities/work-type.permissions.ts
 * export const WorkTypePermissions = createPermissions('Catalog.work_types');
 * // { index: 'Catalog.work_types.index', create: 'Catalog.work_types.create', … }
 * ```
 *
 * Deliberately not derived from the service's `resource`. A permission's
 * vocabulary belongs to whatever grants it — usually the back end — and it is
 * not the same vocabulary as a URL: `Catalog.work_types` against
 * `admin/work-types`. Deriving one from the other would mean encoding a mapping
 * that is itself the permission, spread across more places than writing it
 * once. This is the same answer `createModelKeys` gives, for the same reason.
 *
 * Actions beyond CRUD are named, not spelled — the prefix is applied for you:
 *
 * ```ts
 * export const WaitlistPermissions = createPermissions('Waitlist.entries', [
 *     'notify',
 *     'convert'
 * ]);
 * WaitlistPermissions.notify; // 'Waitlist.entries.notify', and typed
 * ```
 *
 * The point is that the string is written once and read everywhere it is
 * needed — the action's `permission`, the route's `meta`, an ad-hoc `can()` —
 * instead of being retyped at each. A permission that drifts between two of
 * those does not fail: it silently hides a control the user should have, or
 * shows one they should not.
 *
 * Nothing here is mandatory. A module whose permissions do not follow one
 * prefix declares the object by hand; this only removes the case where they do.
 */
export function createPermissions<const TExtra extends readonly string[] = []>(
    prefix: string,
    extras?: TExtra,
    options?: CreatePermissionsOptions
): Permissions<TExtra[number]> {
    const separator = options?.separator ?? '.';
    const root = trimTrailing(prefix.trim(), separator);
    if (!root) {
        throw new Error(
            '[phalanx] createPermissions needs a prefix — it becomes the permission root.'
        );
    }

    const clash = extras?.find((name) => (BASE as readonly string[]).includes(name));
    if (clash) {
        // Overwriting `delete` with a differently-spelled `delete` is exactly
        // the drift this function exists to prevent, so it is refused rather
        // than merged.
        throw new Error(
            `[phalanx] '${clash}' is one of the five base actions and cannot be redeclared as an extra.`
        );
    }

    const permissions: Record<string, string> = {};
    for (const name of [...BASE, ...(extras ?? [])]) {
        permissions[name] = `${root}${separator}${name}`;
    }
    return permissions as Permissions<TExtra[number]>;
}

/** Trailing separators, however many, so `'a.b.'` and `'a.b'` agree. */
function trimTrailing(value: string, separator: string): string {
    if (!separator) return value;
    let end = value.length;
    while (end >= separator.length && value.startsWith(separator, end - separator.length)) {
        end -= separator.length;
    }
    return value.slice(0, end);
}
