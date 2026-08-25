/**
 * Safely retrieves a nested property from an object using an array of keys.
 *
 * Used internally to extract tokens from response payloads via dot-notation
 * paths (callers do `path.split('.')` and pass the result in).
 *
 * @example
 *   safeGet({ a: { b: { c: 10 } } }, ['a', 'b', 'c']) // 10
 *   safeGet({ a: { b: { c: 10 } } }, ['a', 'x', 'c']) // undefined
 */
export function safeGet(obj: Record<string, unknown>, keys: string[]): unknown {
    return keys.reduce<unknown>(
        (acc, key) => {
            if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
                return (acc as Record<string, unknown>)[key];
            }
            return undefined;
        },
        obj
    );
}

/**
 * Appends a single value to a `FormData` object under `key`, handling the
 * common value shapes correctly:
 * - `null` / `undefined` → skipped (no field emitted)
 * - `Blob` / `File`      → appended as-is
 * - `ArrayBuffer`        → wrapped in a `Blob`
 * - `Date`               → ISO-8601 string (stable, not locale-dependent)
 * - `Array`              → each item under `key[index]` (recursively)
 * - nested object        → recursed with `key` as namespace
 * - `boolean`            → `"1"` / `"0"`
 * - everything else      → stringified
 */
function appendFormValue(fd: FormData, key: string, value: unknown): void {
    if (value === undefined || value === null) {
        return;
    }
    if (value instanceof Blob || (typeof File !== 'undefined' && value instanceof File)) {
        fd.append(key, value);
        return;
    }
    if (value instanceof ArrayBuffer) {
        fd.append(key, new Blob([value]));
        return;
    }
    if (value instanceof Date) {
        fd.append(key, value.toISOString());
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((item, index) => appendFormValue(fd, `${key}[${index}]`, item));
        return;
    }
    if (typeof value === 'object') {
        objectToFormData(value as Record<string, unknown>, fd, key);
        return;
    }
    if (typeof value === 'boolean') {
        fd.append(key, String(Number(value)));
        return;
    }
    fd.append(key, String(value));
}

/**
 * Recursively converts a JavaScript object into a `FormData` object.
 *
 * Handles nested objects/arrays, `File`/`Blob`/`ArrayBuffer`, `Date` (ISO),
 * boolean→`1`/`0`, and skips `null`/`undefined` values.
 */
export function objectToFormData(
    obj: Record<string, unknown> | null | undefined,
    form?: FormData,
    namespace?: string
): FormData {
    const fd = form || new FormData();
    if (obj === null || obj === undefined) {
        return fd;
    }

    for (const property in obj) {
        if (!Object.prototype.hasOwnProperty.call(obj, property)) {
            continue;
        }
        const formKey = namespace ? `${namespace}[${property}]` : property;
        appendFormValue(fd, formKey, obj[property]);
    }

    return fd;
}
