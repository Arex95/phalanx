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
    invalidate?: string[] | { only: string[] };
}

// `any` here, deliberately: this must match a RestStd method with ANY real
// parameter signature. TS checks function parameters contravariantly, so
// `unknown[]` would reject a method like `confirm(p: { id: string })` —
// `{ id: string }` is more specific than `unknown`, which reads as "less
// permissive", failing the assignability check. `any` is the only type that
// accepts every concrete signature without narrowing it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ActionFn = (...args: any[]) => Promise<any>;

export type WithActionMeta<TFn extends ActionFn> = TFn & { meta: ActionMeta };

/**
 * Attaches metadata to a RestStd static method without wrapping it.
 * `fn` must stay a `function` expression (not an arrow function): callers
 * bind it to the RestStd subclass at call time, and only a `function`
 * respects that binding for `this.customRequest(...)` to resolve correctly.
 */
export function defineAction<TFn extends ActionFn>(fn: TFn, meta: ActionMeta): WithActionMeta<TFn> {
    return Object.assign(fn, { meta });
}
