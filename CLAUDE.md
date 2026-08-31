# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Commands

```bash
pnpm install
pnpm test            # 322 tests, vitest + happy-dom
pnpm typecheck       # vue-tsc --noEmit, source only
pnpm typecheck:test  # tsc -p tsconfig.test.json, the tests
pnpm lint            # eslint . — the whole repo, not just src/
pnpm build           # rollup + scripts/fix-dts-aliases.mjs
pnpm -C docs dev     # documentation site
```

`prepublishOnly` chains typecheck, typecheck:test, lint, test and build. A red
gate blocks `npm publish`. Do not weaken it.

There is no dev server — this is a library. To exercise it against a real app,
link it into a consumer with `yalc` (not `pnpm link`: Vite's dependency
pre-bundling skips symlinks and you end up with two Vue instances).

## What this is

`@arex95/phalanx` — an opinionated REST + Auth foundation for Vue 3 admin
panels, installed as a plugin: `app.use(Phalanx, options)`. It ships no
components and no styles.

Public documentation lives in `docs/` and is published to
https://arex95.github.io/phalanx/ by `.github/workflows/docs.yml`. **Docs
derived from a code change go in the same commit as the change.**

**Build:** Rollup with `@rollup/plugin-typescript`, ESM only (`dist/index.mjs`).
Peer dependencies — `vue`, `axios`, `@tanstack/vue-query`, `jwt-decode` — are
external. There are exactly four; adding a fifth is a decision, not a detail.

**TypeScript paths:** `@/*` → `src/*`, plus `@composables/*`, `@config/*`,
`@enums/*`, `@rest/*`, `@services/*`, `@types/*`, `@utils/*`. Rollup does not
rewrite these in the emitted `.d.ts`, which is what `scripts/fix-dts-aliases.mjs`
exists for. It has its own post-condition check and **exits non-zero** if any
import in `dist/` cannot be resolved — a published package with unresolvable
types was possible before it existed.

## Module structure

```
src/
├── index.ts          Plugin entry + re-exports
├── actions/          defineAction, withActionBehaviour, ActionCancelledError
├── composables/
│   ├── auth/         useAuth
│   ├── queries/      createDomainQueries, toJsonApi
│   └── mutations/    createDomainMutations, crudAugment.typecheck.ts
├── config/
│   ├── global/       endpoints, tokenPaths, refreshTokenPaths, csrf, encryption, callbacks
│   ├── axios/        the axios instance and its interceptors
│   └── auth/         the auth fetcher
├── crypto/           encryptField (AES-GCM + RSA-OAEP)
├── rest/             RestStd
├── services/         accessToken, refreshTokens, credentials, extractTokens
├── errors/           BaseError + subclasses + normalizeHttpError
├── enums/  types/  utils/  fetchers/
```

## Things that will bite you

**The access token is in memory and nowhere else.** `services/accessToken.ts`
holds a module-level `ref`. There is no `appKey`, no encrypted storage, no
token in `localStorage` — those were removed in v6 because a key that ships in
the bundle protects nothing. The refresh token is an `HttpOnly` cookie the
library cannot read, and half the flow therefore lives in the backend
(`docs/concepts/backend-contract.md`).

**`crudAugment.typecheck.ts` is not a vitest test.** Vitest does not typecheck,
so its `@ts-expect-error` directives are checked by `vue-tsc` instead. They
assert failures that must keep happening. If `pnpm typecheck` reports an unused
`@ts-expect-error` directive there, a type-level guarantee has silently broken —
that is the file doing its job, not noise to delete.

**Two type traps live in this codebase, both of which compiled clean:**
`Record<string, never>` has an implicit index signature, so it is not an empty
type — use `Record<never, never>`. And a naked conditional type distributes over
a union; `UseMutationReturnType` *is* a union, so comparisons need the
`[T] extends [X]` tuple form.

**Config singletons are module-level.** Fine in a browser, wrong in SSR request
handling. Never drive them from a request handler.

**Custom service methods take at most one argument.** The inference in
`createDomainMutations` cannot express more. Pass an object.

**`customRequest` takes a full `url`** and does not prefix `resource`.

**Commit as `arex95`, never the global gitconfig identity.** The repo has a
local `user.email` set for this reason.

## Testing

Tests sit beside their source (`src/**/*.test.ts`) and are excluded from the
build tsconfig, so nothing leaks into the published `.d.ts`.

Writing them found five bugs that reading the code had not. When adding a
behaviour, write the case that **must fail** as well as the one that must pass —
that is what caught the worst defects here. Do not count microtask ticks;
use `vi.waitFor`. Reset module state with `vi.resetModules()` for singletons.
