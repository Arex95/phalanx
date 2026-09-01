# Services

A service is a class extending `RestStd`. Members are static — there is nothing
to instantiate and no per-instance state.

```ts
import { RestStd } from '@arex95/phalanx';

export class UserService extends RestStd {
    static resource = 'users';
}
```

## Inherited methods

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
| `upsert({ data })` | `POST` or `PUT`, see below |
| `customRequest({ method, url, … })` | anything else |

Every method is `async` and rejects with a [typed error](/guide/errors).

Each accepts an optional `url` to override the resource path for that call, and
read methods accept `params` for the query string.

```ts
await UserService.getAll({ params: { page: 1, status: 'active' } });
await UserService.getOne({ id: '7', params: { include: 'roles' } });
```

### `upsert`

Dispatches on `data.id`: `null` or `undefined` creates, anything else updates.
`0` and `''` are treated as identifiers.

```ts
await UserService.upsert({ data: { id: null, name: 'Ada' } });   // POST
await UserService.upsert({ data: { id: '7', name: 'Ada' } });    // PUT /users/7
```

### `customRequest`

Takes a complete `url` and does not prefix `resource`.

```ts
static exportCsv(range: { from: string; to: string }) {
    return this.customRequest<Blob>({
        method: 'GET',
        url: `${this.resource}/export`,
        params: range
    });
}
```

## Request bodies

The body type is detected from the value:

| Value | `Content-Type` |
|---|---|
| `FormData`, `Blob`, `ArrayBuffer` | not set — the client adds the multipart boundary |
| anything else | `application/json` |

```ts
const form = new FormData();
form.append('avatar', file);
await UserService.patch({ id: '7', data: form });
```

`objectToFormData(obj)` is exported for building one from a plain object; it
walks nested objects and arrays and skips `null` and `undefined`.

## Static configuration

```ts
export class UserService extends RestStd {
    static resource = 'users';
    static headers = { 'X-Tenant': 'acme' };
    static retryConfig = { retries: 3, retryDelay: 1000, maxRetryDelay: 10_000 };
    static fetchFn = createAxiosFetcher(anotherAxiosInstance);
}
```

| Member | Effect |
|---|---|
| `resource` | base path — required |
| `headers` | merged into every request from this class |
| `retryConfig` | retry with exponential backoff |
| `fetchFn` | replaces the transport for this class |

`setHeaders(headers)` replaces `headers` at runtime, for values known only after
login.

### Retries

```ts
interface RetryConfig {
    retries?: number;              // 3
    retryDelay?: number;           // 1000 ms
    maxRetryDelay?: number;        // 10000 ms
    backoffMultiplier?: number;    // 2
    retryCondition?: (error: unknown) => boolean;
}
```

The default condition retries network errors and responses with status 408, 429
or ≥ 500. Delays are not jittered, so many clients recovering from one outage
retry in step; pass `retryCondition` or your own delays if that matters.

## Custom methods

Anything that is not CRUD is a static method on the service. These appear on the
generated queries and mutations with their inferred types.

```ts
export class UserService extends RestStd {
    static resource = 'users';

    static suspend(id: string) {
        return this.customRequest<User>({
            method: 'POST',
            url: `users/${id}/suspend`
        });
    }
}
```

::: tip
A method that will be used as a mutation takes at most one parameter — the
generated signature cannot express more. Pass an object.
:::

## Replacing the transport

The transport is a single function:

```ts
type Fetcher = (config: FetcherConfig) => Promise<unknown>;

interface FetcherConfig {
    method: string;
    url: string;
    params?: Record<string, unknown>;
    data?: unknown;
    headers?: Record<string, string>;
}
```

`createAxiosFetcher` is the built-in implementation. Any other client is an
adapter written in your project:

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

configAuthFetcher(ofetchFetcher);          // login, refresh, logout
UserService.fetchFn = ofetchFetcher;       // one service
```
