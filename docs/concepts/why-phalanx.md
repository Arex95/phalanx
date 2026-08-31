# Why Phalanx

## The name

A phalanx is not stronger equipment. It is the same soldier, placed
differently. The formation wins because **nobody chooses their own position** —
and it dies from one gap in the line.

That is the argument for an opinionated foundation, and also its warning label.

## What it is

Phalanx decides three things for you:

1. **How the app talks to a REST API** — one service class per resource, with
   the CRUD surface inherited and the rest declared on it.
2. **How it authenticates** — access token in memory, refresh in an `HttpOnly`
   cookie, one refresh in flight, requests queued behind it.
3. **How non-CRUD operations behave** — permission, confirmation, notification
   and cache invalidation declared as data, next to the operation.

Everything else is yours: components, styling, routing, state, forms.

## The gap it exists to close

Admin tooling is generous with CRUD. Generate a resource, get a list, a form,
a detail page. That is the comfortable 80%.

The other 20% is where a real panel lives: suspend an account, approve a
refund, close an accounting period, export a range. Each carries the same four
questions, and most stacks answer none of them:

- Is this user allowed to do it?
- Should we ask before doing it?
- What do we tell them when it finishes, or fails?
- What is now stale in the cache?

Answered by hand in every view, those answers drift. One screen forgets the
permission check. Another asks for confirmation on a harmless action and not on
a destructive one. A third leaves a stale list on screen. None of it shows up
in a code review, because each view looks reasonable on its own.

`defineAction` moves all four next to the operation, once, where they are hard
to forget and impossible to contradict.

## What it refuses to do

- **It ships no components.** A foundation that also owns your buttons is a
  framework you cannot leave.
- **It does not lock you to a transport.** Axios is the default, not a
  requirement; any function matching the `Fetcher` contract works.
- **It does not pretend a browser can keep a secret.** See
  [The auth model](/concepts/auth-model).
- **It does not encrypt tokens client-side.** Encryption with a key that ships
  in the same bundle is encoding.

## What it costs

Opinions are only worth having if you say what they cost.

- **TanStack Query is a peer dependency, not a suggestion.** Queries and
  mutations are its objects. If you use another cache, you use the services
  directly and skip that layer.
- **Services are static classes.** No dependency injection, no instances. That
  is deliberate — there is no per-instance state to be wrong about — but it is
  not fashionable, and it is not mockable by construction. Override `fetchFn`
  instead.
- **A custom mutation takes at most one argument.** The type inference that
  makes custom methods appear on the mutations, correctly typed, cannot express
  more. Pass an object.
- **Config lives in module singletons.** One configuration per process. That is
  fine in a browser and wrong in SSR request handling — do not drive them from
  a request handler.
