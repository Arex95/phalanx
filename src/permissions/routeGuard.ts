import { canAnyAsync, canAsync } from './permissionState';

/** As much of a route as this needs to know. Deliberately not a router type. */
export interface PermissionedRoute {
    meta?: Record<string, unknown>;
    matched?: readonly { meta?: Record<string, unknown> }[];
}

export interface PermissionGuardOptions {
    /**
     * Where the requirement is written. Defaults to `meta.permission`, taking
     * a string or a list — a list passes when **any** one is held, which is
     * how "index or index_own" is usually expressed.
     *
     * Replace it to read a different field, or to require all of a list
     * instead of any.
     */
    read?: (route: PermissionedRoute) => string | readonly string[] | undefined;
    /**
     * Whether a nested route inherits its parents' requirements. Defaults to
     * `true`: a child of a protected section is protected. Requires the router
     * to expose `matched`; without it only the leaf is read.
     */
    inherit?: boolean;
}

/**
 * Builds the permission half of a navigation guard, and only that half.
 *
 * This library has no router dependency and does not gain one here: the guard
 * returns a verdict, and the consumer decides what a denial means — a redirect,
 * a 403 view, a different landing page. Everything else a real guard does —
 * loading a profile, tenancy, default routes — stays in the consumer's, where
 * it belongs.
 *
 * ```ts
 * const guard = createPermissionGuard();
 *
 * router.beforeEach(async (to) => {
 *     if (await guard(to)) return true;
 *     return { name: 'accessDenied' };
 * });
 * ```
 *
 * Asynchronous because a route is the one place that can afford to wait and
 * must not guess: entering on an optimistic `true` renders the page before the
 * verdict lands. A synchronous `checkPermission` resolves immediately, so a
 * consumer whose permissions are already loaded pays a microtask.
 *
 * Fail-closed: a route that declares a requirement is refused unless the
 * permission is held. A route that declares none is allowed — this guard
 * answers about permissions, and a route with no requirement has none.
 */
export function createPermissionGuard(options: PermissionGuardOptions = {}) {
    const read = options.read ?? defaultRead;
    const inherit = options.inherit ?? true;

    return async function guard(route: PermissionedRoute): Promise<boolean> {
        for (const required of requirements(route, read, inherit)) {
            const allowed = Array.isArray(required)
                ? await canAnyAsync(required)
                : await canAsync(required as string);
            if (!allowed) return false;
        }
        return true;
    };
}

function defaultRead(route: PermissionedRoute): string | readonly string[] | undefined {
    const declared = route.meta?.permission;
    if (typeof declared === 'string') return declared;
    if (Array.isArray(declared) && declared.every((item) => typeof item === 'string')) {
        return declared as readonly string[];
    }
    return undefined;
}

/** Every requirement on the way to this route, outermost first. */
function* requirements(
    route: PermissionedRoute,
    read: NonNullable<PermissionGuardOptions['read']>,
    inherit: boolean
): Generator<string | readonly string[]> {
    if (inherit && route.matched?.length) {
        for (const record of route.matched) {
            const required = read(record);
            if (required !== undefined) yield required;
        }
        return;
    }
    const required = read(route);
    if (required !== undefined) yield required;
}
