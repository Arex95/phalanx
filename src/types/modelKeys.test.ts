import { describe, expect, it } from 'vitest';
import { createModelKeys } from './modelKeys';
import type { BaseModelKeys } from './domain';

describe('createModelKeys', () => {
    it('builds the five under the namespace', () => {
        expect(createModelKeys('admin:user')).toEqual({
            list: 'admin:user:list',
            item: 'admin:user:item',
            selected: 'admin:user:selected',
            collection: 'admin:user:collection',
            filter: 'admin:user:filter'
        });
    });

    it('satisfies BaseModelKeys', () => {
        const keys: BaseModelKeys = createModelKeys('admin:user');
        expect(keys.list).toBe('admin:user:list');
    });

    it('namespaces the extras too, so the prefix is written once', () => {
        const keys = createModelKeys('admin:user', ['archived', 'pending']);
        expect(keys.archived).toBe('admin:user:archived');
        expect(keys.pending).toBe('admin:user:pending');
        expect(keys.list).toBe('admin:user:list');
    });

    it('a declared extra is typed as a string, an undeclared one is not generated', () => {
        const keys = createModelKeys('admin:user', ['archived']);

        // Declared: `string`, not `string | undefined`.
        const archived: string = keys.archived;
        expect(archived).toBe('admin:user:archived');

        // Undeclared names type-check — the composables' `keys` requires an
        // index signature so a custom method's key can be looked up by name —
        // but nothing is generated for them.
        expect(keys.pending).toBeUndefined();
    });

    it('tolerates a trailing colon rather than producing a double one', () => {
        expect(createModelKeys('admin:user:').list).toBe('admin:user:list');
        expect(createModelKeys('admin:user::').list).toBe('admin:user:list');
    });

    it('trims surrounding whitespace', () => {
        expect(createModelKeys('  admin:user  ').list).toBe('admin:user:list');
    });

    it('refuses an empty namespace instead of producing ":list"', () => {
        expect(() => createModelKeys('')).toThrow(/needs a namespace/);
        expect(() => createModelKeys('   ')).toThrow(/needs a namespace/);
        expect(() => createModelKeys(':')).toThrow(/needs a namespace/);
    });

    it('refuses an extra that would overwrite one of the five', () => {
        // Merging it would produce exactly the silent staleness this prevents.
        expect(() => createModelKeys('admin:user', ['list'])).toThrow(/base keys/);
        expect(() => createModelKeys('admin:user', ['ok', 'filter'])).toThrow(/'filter'/);
    });

    it('a single-segment namespace works', () => {
        expect(createModelKeys('user').item).toBe('user:item');
    });

    it('two domains under different namespaces do not collide', () => {
        const a = createModelKeys('admin:user');
        const b = createModelKeys('billing:user');
        expect(a.list).not.toBe(b.list);
    });

    it('returns a fresh object each call', () => {
        const a = createModelKeys('admin:user');
        const b = createModelKeys('admin:user');
        expect(a).not.toBe(b);
        expect(a).toEqual(b);
    });
});
