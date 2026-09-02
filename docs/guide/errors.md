# Error handling

Every service method rejects with one of four classes, whatever the transport
was. Branch on the type instead of on status codes.

```ts
import { AuthError, ValidationError, ServerError, NetworkError } from '@arex95/phalanx';

try {
    await UserService.create({ data });
} catch (error) {
    if (error instanceof ValidationError) return showFieldErrors(error.issues);
    if (error instanceof AuthError) return router.push({ name: 'login' });
    throw error;
}
```

## The hierarchy

```
BaseError
├── NetworkError     NETWORK_ERROR      no response, or an unclassified one
├── AuthError        AUTH_ERROR         401, 403
├── ValidationError  VALIDATION_ERROR   422, carries issues[]
└── ServerError      SERVER_ERROR       500 and above
```

| Property | |
|---|---|
| `code` | the stable string above |
| `statusCode` | the HTTP status, when there was a response |
| `message` | the API's message when present, otherwise a default |
| `context` | `{ responseData, status, headers }` |

`context.headers` is preserved, so an error code returned in a header survives
normalisation:

```ts
import { getErrorCode, isErrorCode } from '@arex95/phalanx';

if (isErrorCode(error, 'DELETE_PROTECTION_ENABLED')) {
    toast.error(t('branch.delete.protected'));
}
```

`getErrorCode(error, header?)` reads `x-error-code` by default and accepts
another name. Both work on a normalized error and on a raw axios one, so code
that also calls a transport directly does not need two paths.

## Validation issues

`ValidationError.issues` is normalised from the shape the API returned:

```ts
interface ValidationIssue {
    field: string;
    message: string;
    value?: unknown;
}
```

Four formats are recognised without configuration:

| API | Shape |
|---|---|
| Spring `BindingResult` | `{ errors: [{ field, defaultMessage, rejectedValue }] }` |
| NestJS `class-validator` | `{ message: string[] }` |
| JSON:API | `{ errors: [{ source: { pointer }, detail }] }` |
| Laravel | `{ errors: { field: string[] } }` |

An unrecognised shape yields an empty `issues` array; the original body stays in
`context.responseData`.

```ts
const fieldErrors = Object.fromEntries(
    error.issues.map((issue) => [issue.field, issue.message])
);
```

## In composables

Queries and mutations surface the same objects:

```ts
const { error } = userQueries.getAll();

watch(error, (e) => {
    if (e instanceof ServerError) reportToSentry(e);
});
```

## Normalising your own calls

`normalizeHttpError` is exported for requests made outside a service:

```ts
import { normalizeHttpError } from '@arex95/phalanx';

try {
    await axios.post('/webhooks/test');
} catch (error) {
    throw normalizeHttpError(error);
}
```

It is idempotent: an error that is already a `BaseError` is returned unchanged,
and a value that is not an HTTP error is returned as it came.

## Constructing them

The classes carry factories, useful when a client-side check should fail the
same way a server one does:

```ts
AuthError.tokenExpired();
ValidationError.fromField('email', 'Already registered');
ServerError.serviceUnavailable();
NetworkError.fromFetchError(error);
```
