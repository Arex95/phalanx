# Services

A service is a class extending `RestStd`. It is static by design: there is
nothing to instantiate, and no state to keep.

```ts
import { RestStd } from '@arex95/phalanx';

export class UserService extends RestStd {
    static resource = 'users';
}
```

`resource` is required. Every method throws a clear error if it is missing,
rather than issuing a request to `undefined`.

## The inherited methods

| Method | Request |
|---|---|
| `getAll(options?)` | `GET /users` |
| `getOne({ id })` | `GET /users/:id` |
| `create({ data })` | `POST /users` |
| `update({ id, data })` | `PUT /users/:id` |
| `patch({ id, data })` | `PATCH /users/:id` |
| `delete({ id })` | `DELETE /users/:id` |
| `bulkCreate({ data })` | `POST /users/bulk` |
| `bulkUpdate({ data })` | `PUT /users/bulk` |
| `bulkDelete({ ids })` | `DELETE /users/bulk` |
| `upsert({ id, data })` | `POST` when `id` is `null`, `PUT` otherwise |
| `customRequest({ method, url, … })` | anything else |

`customRequest` is the exception to the pattern: it takes a **full `url`** and
does not prefix it with `resource`. Build the path yourself, as the examples
below do.

All of them are `async` and return a `Promise`. That is worth stating because
it was once not true: a validation failure used to throw synchronously, so
`await service.create(...)` inside a `try` block escaped the `catch`.

### `upsert`

`id: null` means "create"; any other value means "update". An empty string is
a legitimate id and is treated as one — it is not the same as `null`.

## Class-level configuration

```ts
export class UserService extends RestStd {
    static resource = 'users';
    static headers = { 'X-Tenant': 'acme' };
    static retryConfig = { retries: 3, retryDelay: 1000, maxRetryDelay: 10000 };
    static fetchFn = myFetcher;
}
```

- `headers` are merged into every request the class issues.
- `retryConfig` applies exponential backoff, capped at `maxRetryDelay`. It
  retries only network errors and server errors — 5xx, 408 and 429 — never a
  4xx you caused. There is no jitter, so a fleet of tabs recovering from the
  same outage will retry in step.
- `fetchFn` replaces the transport for this service only.

`setHeaders()` overrides them at runtime.

## Custom methods

Anything that is not CRUD goes on the service as a static method:

```ts
export class UserService extends RestStd {
    static resource = 'users';

    static suspend(id: string) {
        return this.customRequest<User>({
            method: 'POST',
            url: `${this.resource}/${id}/suspend`
        });
    }

    static exportCsv(params: { from: string; to: string }) {
        return this.customRequest<Blob>({
            method: 'GET',
            url: `${this.resource}/export`,
            params
        });
    }
}
```

These are what `createDomainQueries` and `createDomainMutations` pick up
automatically, with their types intact.

## Bringing your own fetcher

The transport is a contract, not a dependency:

```ts
type Fetcher = (config: FetcherConfig) => Promise<unknown>;
```

Axios is the built-in implementation and the default. Anything else — `ofetch`,
native `fetch`, a mock in tests — is a function of that shape, written in your
project. Phalanx does not depend on it and does not ship it:

```ts
import { configAuthFetcher, type Fetcher } from '@arex95/phalanx';
import { $fetch } from 'ofetch';

const ofetchFetcher: Fetcher = (config) =>
    $fetch(config.url, {
        method: config.method,
        query: config.params,
        body: config.data,
        headers: config.headers
    });

configAuthFetcher(ofetchFetcher);
```
