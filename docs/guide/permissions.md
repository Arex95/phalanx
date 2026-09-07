# Permissions

One check, registered once, read everywhere: the buttons, the rows, the routes
and the menu. Phalanx decides where a verdict is needed and when it is
re-evaluated. What the verdict *is* stays yours.

```ts
import { configActions } from '@arex95/phalanx';

configActions({
    checkPermission: (permission) => auth.can(permission)
});
```

## Naming them once

```ts
// entities/work-type.permissions.ts
import { createPermissions } from '@arex95/phalanx';

export const WorkTypePermissions = createPermissions('Catalog.work_types');
// { index: 'Catalog.work_types.index', create: 'Catalog.work_types.create', … }
```

Actions beyond CRUD are named, and the prefix is applied for you:

```ts
export const WaitlistPermissions = createPermissions('Waitlist.entries', [
    'notify',
    'convert'
]);
```

A permission string is read in at least three places — the action's
`permission`, the route's `meta`, an ad-hoc check — and retyping it at each is
how one of them ends up different. That failure is silent in the worse
direction: a control the user should have never appears, and nobody reports a
button they have never seen.

The separator defaults to `.` and is configurable:

```ts
createPermissions('users', ['ban'], { separator: ':' }).ban; // 'users:ban'
```

::: tip Not derived from `resource`, on purpose
A permission's vocabulary belongs to whatever grants it, and it is not a URL's
vocabulary — `Catalog.work_types` against `admin/work-types`. Deriving one from
the other means writing a mapping that is itself the permission, in more places
than declaring it once. Same answer as
[`createModelKeys`](/guide/queries#cache-keys), same reason.
:::

## Asking, outside an action

```ts
import { can, canAny, canAll } from '@arex95/phalanx';

can(WorkTypePermissions.create);
canAny([WaitlistPermissions.index, 'Waitlist.entries.index_own']);
canAll([WorkTypePermissions.update, WorkTypePermissions.delete]);
```

These read the check registered through `configActions` — the same source the
action buttons use, which is what stops a button and the route behind it from
disagreeing. With no check registered everything is permitted: the library does
not invent a permission system for an application that has not wired one.

`can` is synchronous. If your check returns a promise it is `false` until the
answer lands, and a `computed` that read it re-evaluates then.
`isPermissionPending` tells "no" apart from "not yet", and `usePermission`
returns both as refs:

```ts
const { allowed, isPending } = usePermission(WorkTypePermissions.create);
```

## Guarding a route

```ts
import { createPermissionGuard } from '@arex95/phalanx';

const guard = createPermissionGuard();

router.beforeEach(async (to) => {
    if (await guard(to)) return true;
    return { name: 'accessDenied' };
});
```

```ts
// routes/waitlist.routes.ts
meta: { permission: WaitlistPermissions.index }
// or any-of:
meta: { permission: [WaitlistPermissions.index, 'Waitlist.entries.index_own'] }
```

Phalanx has no router dependency and does not gain one here. The guard returns
a verdict; **what a denial means is yours** — a redirect, a 403 view, a
different landing page. Everything else a real guard does, such as loading a
profile or resolving tenancy, stays in yours too.

It is asynchronous because a route is the one place that can afford to wait and
must not guess: entering on an optimistic `true` renders the page before the
verdict. A synchronous check resolves in a microtask.

Fail-closed: a route that declares a requirement is refused unless it is held.
A route that declares none is allowed — this guard answers about permissions,
and a route with no requirement has none.

| Option | |
|---|---|
| `read` | where the requirement is written. Defaults to `meta.permission` |
| `inherit` | whether a child inherits its parents' requirements. Defaults to `true` |

## Gating one row

An action's permission answers once for the whole domain. A table needs a
second answer per row — see
[Authorizing a row](/guide/actions#authorizing-a-row).

```ts
visible: notify.isAuthorizedFor(row)
```
