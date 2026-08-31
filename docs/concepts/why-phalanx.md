# Why Phalanx

Vue has no opinionated answer for the data layer of an admin panel. Most
projects assemble one: an axios instance with a bearer interceptor, a queue that
holds requests during a token refresh, a class per resource, and — in every view
that does something other than CRUD — a permission check, a confirmation dialog,
a toast and a list of cache keys to invalidate.

Phalanx is that assembly, done once.

```ts
class UserService extends RestStd {
    static resource = 'users';

    static suspend = defineAction(
        (id: string) => this.customRequest({ method: 'POST', url: `users/${id}/suspend` }),
        { permission: 'users.suspend', requiresConfirmation: true, invalidate: ['users'] }
    );
}

const keys = { all: 'users', one: 'user' };
export const userQueries = createDomainQueries({ service: UserService, keys });
export const userMutations = createDomainMutations({ service: UserService, keys });
```

`userMutations.suspend` is a TanStack mutation with an `isAuthorized` computed,
a confirmation step, and its own invalidation — typed from the service method.

## What it decides

- **Transport.** One class per resource, eleven inherited methods, typed errors
  out of every call.
- **Session.** Access token in memory, refresh in an `HttpOnly` cookie, one
  refresh in flight with the rest queued behind it.
- **Non-CRUD operations.** Permission, confirmation, notification and
  invalidation declared next to the operation instead of in the view.

## What it leaves alone

No components, no styles, no router integration, no form library, no state
management beyond TanStack Query. The transport is a one-function contract, so
axios is replaceable.

## Tradeoffs

- **TanStack Query is a peer dependency.** The queries and mutations are its
  objects. With another cache, use the services directly and skip that layer.
- **Services are static classes.** No instances, no dependency injection. Swap
  `fetchFn` to substitute the transport in tests.
- **A custom mutation takes at most one argument.** More than one cannot be
  expressed in the inferred signature. Pass an object.
- **Configuration is a module singleton.** One configuration per process, which
  suits a browser and rules out driving it from SSR request handling.
- **Session handling assumes the SPA calls the API directly.** Behind a
  backend-for-frontend, the BFF holds the tokens and this layer is redundant.
