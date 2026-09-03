# Why Phalanx

Vue has no opinionated answer for what sits under an admin panel. Every project
assembles the same layer: an axios instance with a bearer interceptor, a queue
that holds requests during a token refresh, a class per resource, and — in every
view that does something other than CRUD — a permission check, a confirmation
dialog, a toast and a list of cache keys to invalidate.

Then come the parts that get built badly because they are nobody's main task: a
stream that reconnects in a loop against an expired token, user data left in
`localStorage` in the clear, a double-clicked submit that creates two records.

Phalanx is that layer, decided once — a headless framework, in the sense the
term is used for this kind of tool: it owns the behaviour and owns none of the
interface.

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
  out of every call, normalised across four common API shapes.
- **Session.** Access token in memory, refresh in an `HttpOnly` cookie, one
  refresh in flight with the rest queued behind it.
- **Non-CRUD operations.** Permission, confirmation, notification and
  invalidation declared next to the operation instead of in the view.
- **Realtime.** A reconnection state machine with backoff, a circuit breaker and
  a token refresh when the stream rejects one — transport injected, so it works
  over SSE, a WebSocket or anything else.
- **Data kept in the browser.** Encrypted under a non-extractable key, with the
  scope of that protection written down rather than implied.
- **The small things that bite.** Idempotency keys, contextual headers, a shared
  signal for when the API is unreachable.

## What it leaves alone

No components, no styles, no router integration, no form library, no state
management beyond TanStack Query, and no scaffolding that generates pages. The
transport is a one-function contract, so axios is replaceable.

That last omission is deliberate and worth naming: a tool that also generates
your screens decides your interface, and the day the design changes you are
fighting it. Phalanx ends where the interface begins.

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
