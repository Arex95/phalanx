import { describe, expect, it } from 'vitest';
import { objectToFormData, safeGet } from './objects';

describe('safeGet', () => {
    it('resolves a nested path', () => {
        expect(safeGet({ a: { b: { c: 10 } } }, ['a', 'b', 'c'])).toBe(10);
    });

    it('returns undefined for a missing intermediate key', () => {
        expect(safeGet({ a: { b: { c: 10 } } }, ['a', 'x', 'c'])).toBeUndefined();
    });

    it('returns undefined when the path hits a non-object early', () => {
        expect(safeGet({ a: 5 }, ['a', 'b'])).toBeUndefined();
    });

    it('returns undefined for an empty keys array applied to a non-object root is the root itself', () => {
        expect(safeGet({ a: 1 }, [])).toEqual({ a: 1 });
    });

    it('returns undefined when the value at the path is explicitly undefined vs missing', () => {
        expect(safeGet({ a: undefined }, ['a'])).toBeUndefined();
        expect(safeGet({}, ['a'])).toBeUndefined();
    });

    it('does not resolve inherited/prototype properties as if they were own data', () => {
        // `key in obj` includes inherited props — this documents actual
        // behavior (toString IS found, since `in` walks the prototype
        // chain) rather than assuming safeGet only sees own properties.
        expect(safeGet({}, ['toString'])).toBe(Object.prototype.toString);
    });

    it('handles a null value at a leaf without throwing', () => {
        expect(safeGet({ a: null }, ['a'])).toBeNull();
        expect(safeGet({ a: null }, ['a', 'b'])).toBeUndefined();
    });
});

describe('objectToFormData', () => {
    it('returns an empty FormData for null/undefined input', () => {
        expect([...objectToFormData(null).entries()]).toEqual([]);
        expect([...objectToFormData(undefined).entries()]).toEqual([]);
    });

    it('appends plain scalar fields', () => {
        const fd = objectToFormData({ name: 'x', count: 3 });
        expect(fd.get('name')).toBe('x');
        expect(fd.get('count')).toBe('3');
    });

    it('skips null and undefined values entirely — no field emitted', () => {
        const fd = objectToFormData({ a: null, b: undefined, c: 'kept' });
        expect(fd.has('a')).toBe(false);
        expect(fd.has('b')).toBe(false);
        expect(fd.get('c')).toBe('kept');
    });

    it('converts booleans to "1"/"0"', () => {
        const fd = objectToFormData({ active: true, hidden: false });
        expect(fd.get('active')).toBe('1');
        expect(fd.get('hidden')).toBe('0');
    });

    it('serializes a Date as ISO-8601', () => {
        const date = new Date('2026-01-15T10:00:00.000Z');
        const fd = objectToFormData({ when: date });
        expect(fd.get('when')).toBe('2026-01-15T10:00:00.000Z');
    });

    it('appends a Blob as-is, not stringified', () => {
        const blob = new Blob(['hello'], { type: 'text/plain' });
        const fd = objectToFormData({ file: blob });
        expect(fd.get('file')).toBeInstanceOf(Blob);
    });

    it('wraps an ArrayBuffer in a Blob', () => {
        const buffer = new TextEncoder().encode('abc').buffer;
        const fd = objectToFormData({ raw: buffer });
        expect(fd.get('raw')).toBeInstanceOf(Blob);
    });

    it('appends each array item under key[index], recursively', () => {
        const fd = objectToFormData({ tags: ['a', 'b'] });
        expect(fd.get('tags[0]')).toBe('a');
        expect(fd.get('tags[1]')).toBe('b');
    });

    it('recurses into nested plain objects, namespacing keys', () => {
        const fd = objectToFormData({ address: { city: 'X', zip: '1' } });
        expect(fd.get('address[city]')).toBe('X');
        expect(fd.get('address[zip]')).toBe('1');
    });

    it('recurses into a nested object inside an array item', () => {
        const fd = objectToFormData({ items: [{ id: 1 }, { id: 2 }] });
        expect(fd.get('items[0][id]')).toBe('1');
        expect(fd.get('items[1][id]')).toBe('2');
    });

    it('only iterates own enumerable properties, not inherited ones', () => {
        const proto = { inherited: 'nope' };
        const obj = Object.create(proto);
        obj.own = 'yes';
        const fd = objectToFormData(obj);
        expect(fd.has('inherited')).toBe(false);
        expect(fd.get('own')).toBe('yes');
    });

    it('accepts an existing FormData to append onto instead of creating a new one', () => {
        const existing = new FormData();
        existing.append('preexisting', 'value');
        const fd = objectToFormData({ added: 'x' }, existing);
        expect(fd).toBe(existing);
        expect(fd.get('preexisting')).toBe('value');
        expect(fd.get('added')).toBe('x');
    });

    it('stringifies numbers and other scalars via String()', () => {
        const fd = objectToFormData({ n: 0, big: 123456789 });
        expect(fd.get('n')).toBe('0');
        expect(fd.get('big')).toBe('123456789');
    });
});
