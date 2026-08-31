/**
 * Compile-time-only regression guard for `CrudAugment` (see
 * `createDomainMutations.ts`). Never imported by `index.ts` — not shipped,
 * not run by vitest (vitest doesn't typecheck by default; `@ts-expect-error`
 * only means anything under real `tsc`). Checked by `pnpm typecheck`
 * (`vue-tsc --noEmit`), which walks the whole `src` tree per tsconfig's
 * `include`.
 *
 * This whole file exists because two real bugs shipped here, invisible to
 * `tsc --noEmit` running clean, and only surfaced by writing exactly this
 * kind of "this specific access must fail to compile" assertion:
 *   1. `Record<string, never>`'s implicit index signature let ANY property
 *      access through silently (resolving to `never`, not an error) —
 *      `CrudAugment`'s discriminator didn't discriminate anything.
 *   2. `UseMutationReturnType` is itself a union (TanStack's idle/pending/
 *      success/error states); a naked `T extends UseMutationReturnType<...>`
 *      conditional distributes over it, producing a mixed result. Fixed
 *      with the `[T] extends [...]` tuple idiom.
 * Both were found by writing an explicit-generics call and watching it
 * fail — not by reading the code and reasoning about it.
 */
import { createDomainMutations } from './createDomainMutations';
import type { RestStdService } from '@/types';

declare const service: RestStdService;

const withCreateConfigured = createDomainMutations({
    service,
    keys: { list: 'l', item: 'i', selected: 's', collection: 'c', filter: 'f' },
    actions: { create: { permission: 'x' } }
});

// `create` was configured — these must exist and typecheck.
void withCreateConfigured.create.isAuthorized.value;
void withCreateConfigured.create.mutateWithoutConfirmation;
void withCreateConfigured.create.mutateAsyncWithoutConfirmation;

// `update` was NOT configured (only `create` was) — must NOT exist.
// @ts-expect-error - update has no `actions` entry, isAuthorized must not exist
void withCreateConfigured.update.isAuthorized;

const withNoActionsConfigured = createDomainMutations({
    service,
    keys: { list: 'l', item: 'i', selected: 's', collection: 'c', filter: 'f' }
});

// No `actions` config at all — must NOT exist on any CRUD method.
// @ts-expect-error - no actions configured at all, isAuthorized must not exist
void withNoActionsConfigured.create.isAuthorized;
