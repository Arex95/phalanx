# Typing from OpenAPI

If your API publishes an OpenAPI document, the types for every request and
response already exist. Generate them and point your services at them, rather
than writing the shapes twice and letting them drift.

Phalanx generates no code and takes no opinion on the tool. The example uses
[`openapi-typescript`][ot], which emits types and nothing else.

## Generate the types

```bash
pnpm add -D openapi-typescript
```

```json
{
  "scripts": {
    "openapi:fetch": "curl -fsS \"${API_URL:-http://localhost:8080}/v3/api-docs\" -o src/openapi/openapi.snapshot.json",
    "openapi:gen": "openapi-typescript src/openapi/openapi.snapshot.json -o src/openapi/schema.generated.ts",
    "openapi:sync": "pnpm openapi:fetch && pnpm openapi:gen"
  }
}
```

Commit both the snapshot and the generated file. The snapshot is what makes a
schema change show up as a diff instead of as a surprise, and it lets the build
run without reaching the API.

## Name the types you use

```ts
// src/modules/user/contracts.ts
import type { components } from '@/openapi/schema.generated';

export type User = components['schemas']['User'];
export type CreateUserRequest = components['schemas']['CreateUserRequest'];
```

A thin file of aliases per module keeps `components['schemas'][…]` out of the
rest of the codebase, and gives you one place to look when the API renames
something.

## Type the service

The generics on every `RestStd` method take those types directly:

```ts
import { RestStd } from '@arex95/phalanx';
import type { User, CreateUserRequest } from '../contracts';

export class UserService extends RestStd {
    static resource = 'users';

    static list(params?: Record<string, unknown>) {
        return this.getAll<{ items: User[]; total: number }, typeof params>({ params });
    }

    static add(data: CreateUserRequest) {
        return this.create<User, CreateUserRequest>({ data });
    }
}
```

`createDomainQueries` and `createDomainMutations` carry those types through, so
`data.items` is `User[]` in the component without another annotation.

## Exhaustive maps over a generated enum

The generated types make a mapping fail at compile time when the API adds a
case, which is the difference between finding out at build and finding out from
a user:

```ts
type FailureCode = NonNullable<components['schemas']['BulkFailure']['code']>;

export const FAILURE_MESSAGE = {
    NOT_FOUND: 'errors.notFound',
    ALREADY_TERMINAL: 'errors.alreadyTerminal',
    VALIDATION_FAILED: 'errors.validationFailed',
    UNEXPECTED: 'errors.unexpected'
} as const satisfies Record<FailureCode, string>;
```

`satisfies Record<FailureCode, string>` is what makes it exhaustive. Add a code
to the API, regenerate, and this object stops satisfying the type.

## Keep it honest in CI

A generated file is only useful while it matches the API. Add a check that
regenerates and fails on a diff:

```bash
pnpm openapi:sync && git diff --exit-code src/openapi/
```

Run it on a schedule or in the pipeline that deploys the backend. Running it
only on frontend pushes tells you about a drift you caused, never about one the
API caused.

## What is not generated, and why

The metadata on an [action](/guide/actions) — the permission, whether to
confirm, what to invalidate — does not come from the schema, because it is not
in it. That a suspension needs confirmation, or which permission governs it, is
a product decision.

Tools exist that generate more than types: [Hey API][hey] emits request
functions and query keys, [Orval][orval] emits TanStack Query hooks, [Kubb][kubb]
emits clients, validators and mocks. They pair with Phalanx the same way — the
generated layer supplies the shapes, and the services carry the behaviour.

[ot]: https://www.npmjs.com/package/openapi-typescript
[hey]: https://heyapi.dev/openapi-ts/plugins/tanstack-query
[orval]: https://orval.dev/
[kubb]: https://kubb.dev/
