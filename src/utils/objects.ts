/**
 * Converts a Proxy object into a plain JavaScript object.
 *
 * @param {ProxyConstructor} proxy - The Proxy object to convert.
 * @returns {any} A new object containing the properties of the Proxy.
 */
export function proxyToPlainObject(proxy: ProxyConstructor): any {
    if (!proxy) return {};
    const plainObject: any = {};
    for (const property of Object.keys(proxy)) {
        plainObject[property] = (proxy as any)[property];
    }
    return plainObject;
}

/**
 * Performs a shallow comparison to check if two objects have the same keys.
 *
 * @param {Record<string, any>} object1 - The first object.
 * @param {Record<string, any>} object2 - The second object.
 * @returns {boolean} `true` if both objects have the exact same set of keys, otherwise `false`.
 */
export function compareObject(object1: Record<string, any>, object2: Record<string, any>): boolean {
    return Object.keys(object1).every(function (element) {
        return Object.keys(object2).includes(element);
    });
}

/**
 * Performs a deep comparison between two objects to determine if they are structurally and value-wise equal.
 *
 * @param {Record<string, any>} object1 - The first object.
 * @param {Record<string, any>} object2 - The second object.
 * @returns {boolean} `true` if the objects are deeply equal, otherwise `false`.
 */
export function deepEqual(object1: Record<string, any>, object2: Record<string, any>): boolean {
    if (object1 === object2) return true;

    if (typeof object1 !== 'object' || typeof object2 !== 'object' || object1 === null || object2 === null) {
        return false;
    }

    const keys1 = Object.keys(object1);
    const keys2 = Object.keys(object2);

    if (keys1.length !== keys2.length) {
        return false;
    }

    for (const key of keys1) {
        if (!keys2.includes(key) || !deepEqual(object1[key], object2[key])) {
            return false;
        }
    }

    return true;
}

/**
 * Creates a deep clone of a given object, including nested objects and arrays.
 *
 * @template T - The type of the object being cloned.
 * @param {T} obj - The object to clone.
 * @returns {T} A new object that is a deep clone of the original.
 * @throws {Error} If the object contains a type that cannot be cloned.
 */
export function deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    if (obj instanceof Date) {
        return new Date(obj.getTime()) as unknown as T;
    }

    if (obj instanceof Array) {
        return obj.map(item => deepClone(item)) as unknown as T;
    }

    if (obj instanceof Object) {
        const copy: Record<string, any> = {};
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                copy[key] = deepClone(obj[key]);
            }
        }
        return copy as T;
    }

    throw new Error('Unable to clone object! Its type is not supported.');
}

/**
 * Converts a flat object into a URL query string.
 *
 * @param {Record<string, any>} obj - The object to convert.
 * @returns {string} The resulting URL query string.
 */
export function objectToQueryString(obj: Record<string, any>): string {
    return Object.keys(obj)
        .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(obj[key]))
        .join('&');
}

// Example usage:
// objectToQueryString({ name: 'John Doe', age: 30 }); // 'name=John%20Doe&age=30'

/**
 * Compares two objects and returns an object containing the keys where their values differ.
 *
 * @param {Record<string, any>} object1 - The first object.
 * @param {Record<string, any>} object2 - The second object.
 * @returns {Record<string, any>} An object where each key represents a difference, and the value contains the differing values from both objects.
 */
export function getObjectDifferences(object1: Record<string, any>, object2: Record<string, any>): Record<string, any> {
    const differences: Record<string, any> = {};

    const keys = new Set([...Object.keys(object1), ...Object.keys(object2)]);

    for (const key of keys) {
        if (object1[key] !== object2[key]) {
            differences[key] = { object1: object1[key], object2: object2[key] };
        }
    }

    return differences;
}

/**
 * Creates a new object containing only the specified keys from the original object.
 *
 * @param {Record<string, any>} obj - The source object.
 * @param {string[]} keys - An array of keys to include in the new object.
 * @returns {Record<string, any>} A new object with the filtered properties.
 */
export function filterObjectByKeys(obj: Record<string, any>, keys: string[]): Record<string, any> {
    const filteredObject: Record<string, any> = {};
    for (const key of keys) {
        if (key in obj) {
            filteredObject[key] = obj[key];
        }
    }
    return filteredObject;
}

// Example usage:
// filterObjectByKeys({ name: 'John', age: 30, job: 'Developer' }, ['name', 'job']); // { name: 'John', job: 'Developer' }

/**
 * Recursively merges the properties of a source object into a target object.
 *
 * @template T - The type of the target object.
 * @param {T} target - The object to merge properties into.
 * @param {Partial<T>} source - The object from which to merge properties.
 * @returns {T} The modified target object.
 */
export function deepMerge<T>(target: T, source: Partial<T>): T {
    if (target === null || typeof target !== 'object' || typeof source !== 'object') {
        return target;
    }

    for (const key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
            // Guard against prototype pollution when merging untrusted input.
            if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
                continue;
            }
            if (source[key] && typeof source[key] === 'object') {
                if (target && !target[key]) {
                    Object.assign(target, { [key]: {} });
                }
                deepMerge(target[key], source[key] as any);
            } else {
                Object.assign(target, { [key]: source[key] });
            }
        }
    }

    return target;
}

/**
 * Checks if an object has no own enumerable properties.
 *
 * @param {Record<string, any>} obj - The object to check.
 * @returns {boolean} `true` if the object is empty, otherwise `false`.
 */
export function isEmptyObject(obj: Record<string, any>): boolean {
    return Object.keys(obj).length === 0;
}

/**
 * Safely retrieves a nested property from an object using an array of keys as the path.
 *
 * @param {Record<string, any>} obj - The object to query.
 * @param {string[]} keys - An array of keys representing the path to the nested property.
 * @returns {*} The value of the nested property, or `undefined` if the path is not valid.
 */
export function safeGet(obj: Record<string, any>, keys: string[]): any {
    return keys.reduce((acc, key) => (acc && acc[key] !== undefined) ? acc[key] : undefined, obj);
}

// Example usage:
// safeGet({ a: { b: { c: 10 } } }, ['a', 'b', 'c']); // 10
// safeGet({ a: { b: { c: 10 } } }, ['a', 'x', 'c']); // undefined

/**
 * Creates a new object with all properties that have `null`, `undefined`, or empty string values removed.
 *
 * @param {Record<string, any>} obj - The source object.
 * @returns {Record<string, any>} A new object containing only the non-empty properties.
 */
export function removeEmptyProperties(obj: Record<string, any>): Record<string, any> {
    return Object.keys(obj)
        .filter(key => obj[key] !== null && obj[key] !== undefined && obj[key] !== '')
        .reduce((acc, key) => {
            acc[key] = obj[key];
            return acc;
        }, {} as Record<string, any>);
}

// Example usage:
// removeEmptyProperties({ a: null, b: 2, c: undefined, d: '', e: 'hello' }); // { b: 2, e: 'hello' }

/**
 * Returns an array of an object's own enumerable property names.
 *
 * @param {Record<string, any>} obj - The object to get the keys from.
 * @returns {string[]} An array of string keys.
 */
export function getObjectKeys(obj: Record<string, any>): string[] {
    return Object.keys(obj);
}

// Example usage:
// getObjectKeys({ name: 'John', age: 30 }); // ['name', 'age']

/**
 * Checks if any of the object's properties are themselves objects (and not null).
 *
 * @param {Record<string, any>} obj - The object to inspect.
 * @returns {boolean} `true` if the object contains at least one nested object, otherwise `false`.
 */
export function hasNestedProperties(obj: Record<string, any>): boolean {
    return Object.values(obj).some(value => typeof value === 'object' && value !== null);
}

// Example usage:
// hasNestedProperties({ a: 1, b: { c: 2 } }); // true
// hasNestedProperties({ a: 1, b: 2 }); // false

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
function appendFormValue(fd: FormData, key: string, value: any): void {
    if (value === undefined || value === null) {
        return;
    }
    if (value instanceof Blob || (typeof File !== 'undefined' && value instanceof File)) {
        fd.append(key, value);
    } else if (value instanceof ArrayBuffer) {
        fd.append(key, new Blob([value]));
    } else if (value instanceof Date) {
        fd.append(key, value.toISOString());
    } else if (Array.isArray(value)) {
        value.forEach((item, index) => appendFormValue(fd, `${key}[${index}]`, item));
    } else if (typeof value === 'object') {
        objectToFormData(value, fd, key);
    } else if (typeof value === 'boolean') {
        fd.append(key, String(Number(value)));
    } else {
        fd.append(key, String(value));
    }
}

/**
 * Recursively converts a JavaScript object into a `FormData` object.
 *
 * Handles nested objects/arrays, `File`/`Blob`/`ArrayBuffer`, `Date` (ISO),
 * boolean→`1`/`0`, and skips `null`/`undefined` values.
 *
 * @param {any} obj - The object to convert.
 * @param {FormData} [form] - An optional existing `FormData` object to append to.
 * @param {string} [namespace] - An optional namespace for keys of nested properties.
 * @returns {FormData} The resulting `FormData` object.
 */
export const objectToFormData = function (obj: any, form?: FormData, namespace?: string): FormData {
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

/**
 * Flattens a nested object into a single-level object with dot-separated keys.
 *
 * @param {Record<string, any>} obj - The object to flatten.
 * @param {string} [parentKey=''] - The prefix to use for the keys of the flattened properties.
 * @param {Record<string, any>} [result={}] - An object to merge the flattened properties into.
 * @returns {Record<string, any>} The flattened object.
 */
export function flattenObject(obj: Record<string, any>, parentKey = '', result: Record<string, any> = {}): Record<string, any> {
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            const propName = parentKey ? `${parentKey}.${key}` : key;
            if (typeof obj[key] === 'object' && obj[key] !== null) {
                flattenObject(obj[key], propName, result);
            } else {
                result[propName] = obj[key];
            }
        }
    }
    return result;
}

// Example usage:
// flattenObject({ a: 1, b: { c: 2, d: { e: 3 } } }); // { 'a': 1, 'b.c': 2, 'b.d.e': 3 }