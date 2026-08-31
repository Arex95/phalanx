# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
pnpm install

# Build the library (outputs to dist/)
pnpm build

# Lint
pnpm eslint src/

# Release (patch/minor/major)
pnpm release
pnpm release:minor
pnpm release:major
```

There are no tests in this project. There is no dev server — this is a library built with Rollup.

## Architecture

This is `@arex95/vue-core`, an opinionated Vue 3 library published to npm. It is installed as a Vue plugin and configured once at startup via `app.use(ArexVueCore, options)`.

**Entry point:** `src/index.ts` — exports everything and defines the `ArexVueCore` plugin object.

**Build:** Rollup with `@rollup/plugin-typescript`. Output is ESM only (`dist/index.mjs`). All peer dependencies (`vue`, `axios`, `@vueuse/core`, `jwt-decode`, `uuid`) are marked external. No `ofetch` — the library's only fetcher extension point is the `Fetcher` contract (`types/Fetcher.ts`); a consumer wiring `ofetch`/Apollo/anything else writes that adapter in their own project.

**TypeScript paths** (configured in `tsconfig.json`):
- `@/*` → `src/*`
- `@composables/*`, `@config/*`, `@enums/*`, `@rest/*`, `@services/*`, `@types/*`, `@utils/*`

### Module structure

```
src/
├── index.ts              # Plugin entry + re-exports everything
├── config/               # Global mutable config (frozen singletons)
│   ├── global/           # Token keys, endpoints, session, token paths, app key
│   ├── axios/            # Axios instance + config
│   └── auth/             # Auth fetcher config
├── rest/
│   └── RestStd.ts        # Base class for REST resources (extends for CRUD)
├── composables/
│   ├── auth/useAuth.ts   # login/logout composable
│   ├── axios/useFetch.ts # Axios-based fetch composable
│   ├── paginators/       # usePaginator
│   ├── sorters/          # useSorter
│   ├── filters/          # useFilter
│   ├── breakpoints/      # useBreakpoint
│   └── monitoring/       # useUserActivity, useApiActivity
├── fetchers/             # Adapter pattern: createAxiosFetcher, createOfetchFetcher
├── services/             # Token extraction, refresh, storage, credentials
├── errors/               # BaseError, NetworkError, AuthError, ValidationError, ServerError
├── enums/                # HTTP exceptions, content types, breakpoints, key codes, storage, etc.
├── types/                # TypeScript interfaces and types
└── utils/                # Standalone utility functions (dates, strings, objects, storage, etc.)
```

### Key design patterns

**Config singletons:** Each config module (`src/config/global/`) holds a frozen module-level variable and exposes `configX()` / `getX()` functions. These are called by the plugin `install()` method to initialize the library before any composables/services run.

**Fetcher abstraction (`src/types/Fetcher.ts`):** The library uses a `Fetcher` type — a single function that accepts a `FetcherConfig` and returns a Promise. `createAxiosFetcher` and `createOfetchFetcher` in `src/fetchers/` produce these. Most APIs accept an optional `fetcher` parameter, defaulting to the configured Axios instance.

**`RestStd` base class (`src/rest/RestStd.ts`):** Extend this for any API resource. Override `static resource = 'your-resource'`. Provides `getAll`, `getOne`, `create`, `update`, `patch`, `delete`, `bulkCreate`, `bulkUpdate`, `bulkDelete`, `upsert`, and `customRequest`. Set `static isFormData = true` to auto-convert data to `FormData`. Set `static retryConfig` to enable retry-with-backoff.

**Token paths (dot notation):** Tokens are extracted from auth responses using dot-notation paths (e.g. `"data.token.access"`), configured via `tokenPaths` and `refreshTokenPaths` in the plugin options.

### Plugin initialization options (`ArexVueCoreOptions`)

- `appKey` — encryption key for credential storage
- `endpoints.login / refresh / logout` — auth API endpoints
- `tokenKeys.accessToken / refreshToken` — localStorage/sessionStorage keys
- `tokenPaths.accessToken / refreshToken` — dot-notation path in login response
- `refreshTokenPaths.accessToken / refreshToken` — dot-notation path in refresh response
- `axios.baseURL / headers / timeout / withCredentials` — Axios instance config
