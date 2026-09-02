# Requests

Two helpers for things every admin ends up needing on the way out.

## Contextual headers

A tenant, a branch, a workspace — a value that is not known when the axios
instance is built, and that only belongs on some routes.

```ts
import { createHeaderInterceptor } from '@arex95/phalanx';

const stop = createHeaderInterceptor({
    header: 'X-Branch-ID',
    value: () => activeBranch.value?.uuid,
    match: /\/admin\//,
    exempt: [/\/admin\/users\/me(\/|$|\?)/]
});
```

| Option | |
|---|---|
| `header` | header name |
| `value` | read on **every** request, so it follows a ref |
| `match` | `RegExp` or predicate over the resolved URL; omitted, all requests |
| `exempt` | exceptions to `match` |
| `instance` | defaults to the instance the plugin configured |

A `null`, `undefined` or empty value leaves the request untouched, which is the
behaviour you want before the value is known.

The returned function ejects the interceptor. Registering twice sends the
header twice, so keep the handle where the caller can run more than once.

## Idempotency keys

A double-clicked submit, or a retry after a timeout, reaches the API as two
requests. An idempotency key lets the server recognise the second as the same
operation.

```ts
import { useIdempotencyKey, IDEMPOTENCY_HEADER } from '@arex95/phalanx';

const idem = useIdempotencyKey({ scope: 'appointment-create' });

await AppointmentService.create({
    data,
    headers: { [IDEMPOTENCY_HEADER]: idem.ensure() }
});

idem.rotate();   // the next appointment is a new operation
```

| | |
|---|---|
| `ensure()` | the current key, generating one on first call |
| `rotate()` | discards it and returns a new one — call after a success |
| `clear()` | forgets it |
| `key` | `Ref<string \| null>` |

The key is kept in `sessionStorage` under the given `scope`, so a reload
mid-submission reuses it rather than creating a second resource. Pass
`persist: false` for a key that should not outlive the page.

Storage that throws — private mode, a browser blocking site data — degrades the
guarantee to "unique per page load" rather than failing the call.

`generateIdempotencyKey()` is exported for code that manages its own keys.
