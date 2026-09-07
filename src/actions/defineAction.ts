import type { RestStd } from '@/rest/RestStd';

export interface ActionMeta {
    permission?: string;
    requiresConfirmation?: boolean;
    /** Resolved via t() — the common case. */
    confirmMessageKey?: string;
    confirmHeaderKey?: string;
    /**
     * Passed through untouched to whatever the consumer wired as the
     * confirmation dialog — this library has no opinion on which UI that
     * is, or what it accepts. Merged last, so it always wins over
     * confirmMessageKey/confirmHeaderKey; a literal message/header here
     * overrides the keys above the same way. If some option the consumer's
     * dialog supports turns out unreachable through this, that is a bug in
     * how the consumer's wiring reads this field, not a reason for this
     * library to know what that option is called.
     */
    confirmOptions?: Record<string, unknown>;
    /** Resolved via t() when notifying after the action settles. */
    successMessageKey?: string;
    errorMessageKey?: string;
    /**
     * Same escape hatch as confirmOptions, passed through untouched to
     * whatever the consumer wired as the notification UI. Merged last.
     */
    notifyOptions?: Record<string, unknown>;
    /**
     * Whether *this record* qualifies, on top of whether the user is allowed.
     * A table needs one verdict per row — an entry already notified cannot be
     * notified again — and `isAuthorized` answers once for the whole domain.
     * `isAuthorizedFor(record)` composes the two.
     *
     * Point it at the rule; do not restate it here. The condition belongs on
     * the hydrated model, where anything else that needs it can read it too:
     *
     * ```ts
     * // entities/waitlist.model.ts
     * get canBeNotified() { return this.status === 'pending'; }
     *
     * // services/waitlist.service.ts
     * allowedWhen: (entry: WaitlistEntry) => entry.canBeNotified
     * ```
     *
     * Inlining `entry.status === 'pending'` here works and is not refused, but
     * the day a badge or an icon needs the same rule it has to be written a
     * second time, and the two drift.
     *
     * `record` is `any` for the same reason `ActionFn`'s parameters are: it
     * must accept a predicate annotated with the consumer's own row type, and
     * parameters are checked contravariantly, so `unknown` would reject it.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    allowedWhen?: (record: any) => boolean;
    invalidate?: string[] | { only: string[] };
}

/**
 * The receiver of an action: the service class itself, since actions are
 * `static` members bound to it at call time (`createDomainMutations` does
 * `rawMethod.bind(service)`). Exported so a consumer can name it when a
 * wider annotation is wanted; the common case never has to.
 */
export type ServiceRef = typeof RestStd;

// `any` for the parameters, deliberately: this must match a RestStd method
// with ANY real parameter signature. TS checks function parameters
// contravariantly, so `unknown[]` would reject a method like
// `confirm(p: { id: string })` — `{ id: string }` is more specific than
// `unknown`, which reads as "less permissive", failing the assignability
// check. `any` is the only type that accepts every concrete signature
// without narrowing it.
//
// `this`, in contrast, is declared. Without it a `function` expression under
// `strict` fails with TS2683 ("'this' implicitly has type 'any'"), and — the
// half that is easy to miss — the resulting `any` also drops the type
// argument on `this.customRequest<T>()` (TS2347), silently losing the return
// type. Declaring it here types `this` contextually, so the consumer writes
// no annotation at all.
export type ActionFn<TThis = ServiceRef> = (
    this: TThis,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...args: any[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => Promise<any>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithActionMeta<TFn extends ActionFn<any>> = TFn & { meta: ActionMeta };

/**
 * Attaches metadata to a RestStd static method without wrapping it.
 *
 * Prefer a `function` expression over an arrow. `createDomainMutations` binds
 * the method to the service class at call time, and only a `function` honours
 * that binding. An arrow captures `this` lexically — which happens to be the
 * class in a `static` initializer, so it works until the service is
 * subclassed, at which point the action keeps resolving against the parent's
 * `resource` with no error raised.
 *
 * `this` is typed for you as the service class:
 *
 * ```ts
 * static suspend = defineAction(function (id: string) {
 *     return this.customRequest<User>({ method: 'POST', url: `users/${id}/suspend` });
 * }, { permission: 'users.suspend' });
 * ```
 *
 * Annotate `this` explicitly only to reach statics the subclass adds of its
 * own — `function (this: typeof UserService, …)`. The second overload exists
 * for that case; without it, the narrower annotation would be rejected, since
 * `this` types are checked contravariantly.
 */
export function defineAction<TFn extends ActionFn<ServiceRef>>(
    fn: TFn,
    meta: ActionMeta
): WithActionMeta<TFn>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function defineAction<TFn extends ActionFn<any>>(
    fn: TFn,
    meta: ActionMeta
): WithActionMeta<TFn>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function defineAction<TFn extends ActionFn<any>>(
    fn: TFn,
    meta: ActionMeta
): WithActionMeta<TFn> {
    return Object.assign(fn, { meta });
}
