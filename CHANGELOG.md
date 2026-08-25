# Unreleased — v6.0.0 (lean rewrite)

**Identity change.** The package is now scoped to **REST + Auth for Vue 3 apps**.
Everything that duplicated `@vueuse/core`, `date-fns`, `zod`, `lodash`, `change-case`, `@tanstack/vue-query`, or belonged to unrelated toolkits (exports/downloads, DOM helpers, breakpoints, monitoring) has been removed.

### ⚠️ Breaking — removed (no `@deprecated`, no alias)

Composables:
- `useFetch`, `usePagination`, `useSorter`, `useFilter`, `useBreakpoint`, `useApiActivity`, `useUserInactivity`.

Utils:
- `debounces.*`, `dates.*`, `strings.*`, `validations.*`, `io.*`, `browser.*`, `exports.*`, `files.*`, `handleError`.
- From `objects.ts`: `deepEqual`, `deepClone`, `deepMerge`, `flattenObject`, `removeEmptyProperties`, `compareObject`, `filterObjectByKeys`, `getObjectDifferences`, `isEmptyObject`, `objectToQueryString`, `getObjectKeys`, `hasNestedProperties`, `proxyToPlainObject`, `objectToFormDataEnhanced`. Only `safeGet` and `objectToFormData` survive.

Enums:
- `KeyCodeEnum`, `ScreenSize`, `ScreenBreakpoint`, `StorageKeyEnum`, `ErrorEnum`, image/audio/video/file/font type enums, `ExceptionEnum` (HTTP status codes). Only `ContentTypeEnum` survives.

Types:
- `ErrorType`, `ExtendedQueryOptions`, `AxiosOptionsParameter`, `DecodedJwtPayload`, `AuthConfig`.
- `options?: Record<string, unknown>` removed from all `RestStdOptions.*` shapes (was unused).

Folder `monitoring/` deleted (was never exported).

### ⚠️ Breaking — `RestStd`

- **`static isFormData` removed.** Serialization is now driven by the runtime shape of `data`:
  `FormData` / `Blob` / `ArrayBuffer` → sent as-is with no `Content-Type` (client emits the correct multipart `boundary`); everything else → `application/json`. Convert plain objects with `objectToFormData()` when you need multipart.
- **`transformData()` removed.** Internal helper superseded by `prepareWrite()`.
- Body+headers logic centralised in a single private helper — the 6 write methods no longer duplicate it.

### ⚠️ Breaking — errors

- `normalizeHttpError` now returns the **actual typed hierarchy** instead of always `NetworkError`:
  - 401 / 403 → `AuthError`
  - 422 → `ValidationError` (with `issues[]` extracted heuristically from Spring / NestJS / JSON:API / Laravel shapes)
  - 5xx → `ServerError`
  - other HTTP → `NetworkError`
- `AuthError`, `ValidationError`, `ServerError` static factory methods (`.unauthorized()`, `.fromIssues()`, `.internal()`, …) are now used by real code — they were dead exports until now.

### ✨ New — `refreshTokenBodyKey`

Optional plugin option that controls the body key used when POSTing to the refresh endpoint. Default `'refresh_token'`. Set to `'refreshToken'` for Spring / NestJS backends.

Fixes the v5.x bug where `refreshTokenPaths.refreshTokenPath` was reused as a body key, breaking silently when the path was nested (`data.refresh_token` → literal `{ "data.refresh_token": … }`).

### 🐛 Fixes

- `useAuth().login()` no longer wraps the call in a redundant `try { … } throw error`.
- `useAuth().logout()` swallows network errors intentionally (logout MUST proceed locally) — no more automatic `console.error`.
- All internal `handleError()` side-effects removed; the library no longer imposes `console.error` on the consumer.
- `credentials.ts` unused import cleaned.
- `ofetch.ts` uses `@ts-expect-error` instead of `@ts-ignore`.
- Wider TypeScript hardening: `Record<string, any>` → `Record<string, unknown>`, `any` → typed shapes across errors, fetchers, normalize, extract, objects. ESLint clean (0 errors).

### 📦 Package

- Dropped `@vueuse/core` and `@tanstack/vue-query` peer dependencies (no code depends on them).
- Removed the CJS lie: `main` now points to `dist/index.mjs` (ESM-only, as it always was on disk).
- Added `"sideEffects": false` so bundlers can tree-shake aggressively.
- Rollup externals trimmed accordingly.

### Migration guide (v5 → v6)

| If you used… | Replace with |
|---|---|
| `useDebounce*` / `throttle` | `@vueuse/core` `useDebounceFn` / `useThrottleFn` |
| `useFilter` / `useSorter` / `usePagination` | `@tanstack/vue-query` + your own selector, or `@vueuse/core` primitives |
| `useBreakpoint` | `@vueuse/core` `useBreakpoints` |
| `useApiActivity` / `useUserInactivity` | `@vueuse/core` `useIdle`, `useDocumentVisibility` |
| `useFetch` | `@tanstack/vue-query` directly |
| `formatDate` / `parseDate` / `daysBetween` / … | `date-fns` or `dayjs` |
| `toCamelCase` / `toKebabCase` / … | `change-case` |
| `isValidEmail` / `isStrongPassword` / … | `zod` / `valibot` |
| `disableRightClick` / `clickOutside` | `@vueuse/core` `onClickOutside` |
| `openWindow` / `copyToClipboard` | `window.open` / `@vueuse/core` `useClipboard` |
| `exportToCSV` / `exportToExcel` | `file-saver` + `xlsx` |
| `readFileAsText` | Native `FileReader` |
| `handleError` | Just `console.error` (or nothing) |
| `deepEqual` / `deepClone` / `deepMerge` | `lodash-es` |
| `static isFormData = true` | Pass `objectToFormData(data)` or a `FormData` at the call site |
| `NetworkError` for 401/422/5xx | `AuthError` / `ValidationError` / `ServerError` (real `instanceof`) |

---

# [5.1.0](https://github.com/Arex95/npm-arex-core/compare/v5.0.0...v5.1.0) (2026-03-09)



# [5.0.0](https://github.com/Arex95/npm-arex-core/compare/v4.0.0...v5.0.0) (2026-03-09)



# [4.0.0](https://github.com/Arex95/npm-arex-core/compare/v3.3.0...v4.0.0) (2026-03-09)


### Bug Fixes

* multiple auth storage bugs + crypto availability check (v3.4.0) ([b8b1caa](https://github.com/Arex95/npm-arex-core/commit/b8b1caa9ac23f768018ff41ab9b481150feb2356))



# [3.3.0](https://github.com/Arex95/npm-arex-core/compare/v3.2.0...v3.3.0) (2026-03-02)



# [3.2.0](https://github.com/Arex95/npm-arex-core/compare/v3.1.0...v3.2.0) (2026-03-02)


### Bug Fixes

* **ssr:** harden auth flow for SSR and SPA environments ([db251bd](https://github.com/Arex95/npm-arex-core/commit/db251bdf321d3d62259e1ff4d5c7c9398304a988))



# [3.1.0](https://github.com/Arex95/npm-arex-core/compare/v3.0.1...v3.1.0) (2026-01-09)



## [3.0.1](https://github.com/Arex95/npm-arex-core/compare/v3.0.0...v3.0.1) (2025-12-02)



# [3.0.0](https://github.com/Arex95/npm-arex-core/compare/v1.1.43...v3.0.0) (2025-12-01)


### Features

* Add comprehensive documentation and remove all tests ([5297128](https://github.com/Arex95/npm-arex-core/commit/52971282124b91947a59b7d39a0c925b9cebb04d))



## [1.1.43](https://github.com/Arex95/npm-arex-core/compare/v1.1.42...v1.1.43) (2025-11-25)



## [1.1.42](https://github.com/Arex95/npm-arex-core/compare/v1.1.6...v1.1.42) (2025-11-25)


### Bug Fixes

* **apiActivity:** improve session timeout handling and add JWT check for activity monitoring ([0969b4d](https://github.com/Arex95/npm-arex-core/commit/0969b4dfc65085a7ce43ee6ce1ff07f237034c7d))
* **auth:** add error handling for missing tokens in login response ([ff7cb0d](https://github.com/Arex95/npm-arex-core/commit/ff7cb0d6f8c65dbd548ada3823dfcda15dcac29f))
* **auth:** correct type import for storageKeys in AuthConfig ([244cd78](https://github.com/Arex95/npm-arex-core/commit/244cd787863a9df57518a1737cd770827d0d5d98))
* **auth:** enhance error handling in useAuth for token verification ([9750cf8](https://github.com/Arex95/npm-arex-core/commit/9750cf829d87dd618ecb39e5ae568c835b9ec643))
* **auth:** ensure JWT promise resolves before returning response ([b7f73ca](https://github.com/Arex95/npm-arex-core/commit/b7f73ca6878a4244392ac2814e7daf699418960d))
* **auth:** remove unused JWT functions and implement verifyAuth in credentials ([e450ebd](https://github.com/Arex95/npm-arex-core/commit/e450ebdaffcfd122d989b300dc0441741e82e46d))
* **auth:** restore axios instance initialization in useAuth function ([e4e14e8](https://github.com/Arex95/npm-arex-core/commit/e4e14e84c60c70572a8e2bc5f322c78c0d8b5484))
* **credentials:** correct storage preference logic for session and local storage ([9bddc83](https://github.com/Arex95/npm-arex-core/commit/9bddc834b1ec688184e90f3d97c6b5edbf07b965))
* **credentials:** move tokensConfig initialization inside functions for better encapsulation ([e863aa0](https://github.com/Arex95/npm-arex-core/commit/e863aa00fb69fe9186009ec29e600f828cd6a308))
* **encryption:** enhance error handling and validation in hex2ab, importKey, and decrypt functions ([d9284d9](https://github.com/Arex95/npm-arex-core/commit/d9284d99fead48226964dccd9059f3a82ea61132))
* **imports:** update import paths for AppKeyConfig and getAppKey for consistency ([b09d04f](https://github.com/Arex95/npm-arex-core/commit/b09d04fc5eb1e0f0b05ce01ec727aef1297f6aa2))
* **package:** update exports field to include types and require entry points ([156987b](https://github.com/Arex95/npm-arex-core/commit/156987b68d8ce3c7104dbafa76cebae58eb95358))
* **session:** rename session persistence functions for consistency, implement logic for save session configuration. ([2305915](https://github.com/Arex95/npm-arex-core/commit/2305915bcd7f5cfc3b2316ecc16d43a7659291f3))
* **tests:** improve hex2ab error handling and enhance decrypt failure cases ([b40ee9f](https://github.com/Arex95/npm-arex-core/commit/b40ee9f7711ecd7dde383e5bd970a9a34cf56838))
* update changelog script to output to CHANGELOG.md and reset versioning ([ca2b873](https://github.com/Arex95/npm-arex-core/commit/ca2b87305b87c60c66a746fb8bd2a2c4cf572ab8))
* update useAuth function to use default secretKey and improve config imports ([154d5db](https://github.com/Arex95/npm-arex-core/commit/154d5db9eac3696dfe1ec1f207912db390919058))


### Features

* add auth exports to composables and ensure sorters are included ([9f0b9a5](https://github.com/Arex95/npm-arex-core/commit/9f0b9a5584bee7efce9b65b1eed7068f4ac7599d))
* add missing exports in types and utils index files ([3970f25](https://github.com/Arex95/npm-arex-core/commit/3970f25ac4005c13ae62d7de6058cedf9755f462))
* **auth:** add encryption utilities and tests ([b935dc7](https://github.com/Arex95/npm-arex-core/commit/b935dc736a5973a12c6e044db8ae39d15a034fe3))
* **auth:** enhance authentication handling and remove unused types ([8428499](https://github.com/Arex95/npm-arex-core/commit/8428499dd90e1d951000c76eb59fbd4c7b0d3cb4))
* **auth:** enhance encryption methods and update dependencies ([b0d32fc](https://github.com/Arex95/npm-arex-core/commit/b0d32fc8064afd9254a27bfcefa7035151d3d407))
* **auth:** refactor authentication flow with new token management and storage services ([f6cf0f5](https://github.com/Arex95/npm-arex-core/commit/f6cf0f5059c0573f0ef949ce0768b92965f2e99e))
* **auth:** refactor verifyAuth to use app key directly and simplify parameters ([89fd162](https://github.com/Arex95/npm-arex-core/commit/89fd16258e8307dd195c419798cc239886d2c0f4))
* **auth:** rename SessionPreference to LocationPreference and update related functions for improved clarity and functionality ([81910e5](https://github.com/Arex95/npm-arex-core/commit/81910e561c95bb1a8054a7a8121d72ca4e624b4c))
* **auth:** replace JWT checks with verifyAuth for improved session management ([9f5c368](https://github.com/Arex95/npm-arex-core/commit/9f5c3683ae00e794bb023fae4ac0faeb4b71d5eb))
* **auth:** replace secret key with app key for improved security and refactor related functions ([6d0ba6d](https://github.com/Arex95/npm-arex-core/commit/6d0ba6d77560df5b5ec5818188c163eb6bc56873))
* **auth:** streamline session persistence handling in useAuth and verifyAuth functions ([a44fecf](https://github.com/Arex95/npm-arex-core/commit/a44fecf615b6cf4e690bcbae7d2b937a60477be8))
* **auth:** update import path for getAppKey and refactor install method for async configuration ([78ca096](https://github.com/Arex95/npm-arex-core/commit/78ca0966d868ac3fe1937ef19682773d88df92f4))
* **axios:** enhance AxiosService with improved token handling and error processing ([305715f](https://github.com/Arex95/npm-arex-core/commit/305715f7f2aeddf80f45171dfca04ba3b0a27cb7))
* **axios:** enhance token management with utility functions ([c64e405](https://github.com/Arex95/npm-arex-core/commit/c64e405c0495d2aee1de1f87996ee68c8d3194de))
* **axios:** refactor AxiosService to use AxiosServiceOptions and improve token handling ([260c1c7](https://github.com/Arex95/npm-arex-core/commit/260c1c7e31996838caaf7b4d1c8cc2884408bf63))
* **axios:** remove createFetch and implement useFetch for Axios requests ([b47036b](https://github.com/Arex95/npm-arex-core/commit/b47036b89c659f9f4ac99b676b0901ce6f05e519))
* **axios:** update imports and enhance AxiosService initialization with refreshAuth function ([280c3cc](https://github.com/Arex95/npm-arex-core/commit/280c3cc31bd00b26e34f750bff53a58a8b4137bd))
* Refactor authentication utilities and add comprehensive tests ([62f19f8](https://github.com/Arex95/npm-arex-core/commit/62f19f8fbb147188ab129a50420e14876d773c57))



## [1.1.6](https://github.com/Arex95/npm-arex-core/compare/v1.1.5...v1.1.6) (2025-06-11)



## [1.1.5](https://github.com/Arex95/npm-arex-core/compare/v1.1.4...v1.1.5) (2025-06-11)


### Bug Fixes

* rename tokenConfig to tokensConfig and update related imports; add isAuthenticated computed property ([40543a7](https://github.com/Arex95/npm-arex-core/commit/40543a75afbb02a811b0aac8d9bfcfd919de7c91))



## [1.1.4](https://github.com/Arex95/npm-arex-core/compare/v1.1.3...v1.1.4) (2025-03-27)


### Bug Fixes

* update npm publish command to include public access ([200bd08](https://github.com/Arex95/npm-arex-core/commit/200bd0811ae1e7b9837d0d056b1bde903791cf87))



## [1.1.3](https://github.com/Arex95/npm-arex-core/compare/v1.1.2...v1.1.3) (2025-03-27)



## [1.1.2](https://github.com/Arex95/npm-arex-core/compare/v1.1.1...v1.1.2) (2025-03-27)


### Bug Fixes

* correct quotation marks in release script for consistency ([b6c29d6](https://github.com/Arex95/npm-arex-core/commit/b6c29d6b6e381f4bbf7e5a89dfcd0d09aa7e516d))



## [1.1.1](https://github.com/Arex95/npm-arex-core/compare/4810753807f85f957c589abcbdd03b1b09eaee06...v1.1.1) (2025-03-27)


### Bug Fixes

* handle potential null values in token expiration and improve type safety in config ([3b8b955](https://github.com/Arex95/npm-arex-core/commit/3b8b9558b17b76a0277810996bf3671f2b311984))


### Features

* add changelog and release scripts to automate versioning and documentation ([02ea2bb](https://github.com/Arex95/npm-arex-core/commit/02ea2bb188259bd41dacf14ef8e90d20ca113ae0))
* add configuration types for session, token, and endpoints ([769d7f1](https://github.com/Arex95/npm-arex-core/commit/769d7f10fc07788a95d2f85e7da6f46783da31ee))
* add ESLint configuration and update dependencies for improved code quality ([14b7602](https://github.com/Arex95/npm-arex-core/commit/14b7602197a148a1b973f5d02a03a83bafd19d14))
* add global headers and data transformation for REST API form data requests ([4810753](https://github.com/Arex95/npm-arex-core/commit/4810753807f85f957c589abcbdd03b1b09eaee06))
* add useUserInactivity hook to monitor user activity and handle inactivity timeout ([d36fe47](https://github.com/Arex95/npm-arex-core/commit/d36fe47c3dd5f8a6b5d5d678191d0eaee934bef0))
* enhance authentication handling with secret key management and add API activity monitoring ([5f69a76](https://github.com/Arex95/npm-arex-core/commit/5f69a76780c0377a6f17ca31cc4004463bf4aeb4))
* expand error messages and styles for additional error types ([cb76c5e](https://github.com/Arex95/npm-arex-core/commit/cb76c5e4ebfc7c1d071bc70bd6672bce36c23c46))
* implement save method for conditional create or update based on item ID ([e8d73eb](https://github.com/Arex95/npm-arex-core/commit/e8d73eba259f25b57a30a2ee28cbfcb42780c9c5))
* refactor constants to enums for better type safety and organization ([7665af7](https://github.com/Arex95/npm-arex-core/commit/7665af70cb6d110be06f5df6f5339ea10800dd8b))
* remove GraphStd class to streamline GraphQL request handling ([e46f573](https://github.com/Arex95/npm-arex-core/commit/e46f5738c56aa22dcb52bc9f03ee40610609e936))
* update storage handling to support session storage and remember me functionality ([b2a0b42](https://github.com/Arex95/npm-arex-core/commit/b2a0b42ef93754912535c1dfba7f7db41f1ca522))



