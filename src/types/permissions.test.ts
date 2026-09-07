import { describe, expect, it } from 'vitest';
import { createPermissions } from './permissions';

describe('createPermissions', () => {
    it('builds the five CRUD actions from one prefix', () => {
        expect(createPermissions('Catalog.work_types')).toEqual({
            index: 'Catalog.work_types.index',
            view: 'Catalog.work_types.view',
            create: 'Catalog.work_types.create',
            update: 'Catalog.work_types.update',
            delete: 'Catalog.work_types.delete'
        });
    });

    it('names extra actions rather than spelling them', () => {
        const perms = createPermissions('Waitlist.entries', ['notify', 'convert', 'reorder']);
        expect(perms.notify).toBe('Waitlist.entries.notify');
        expect(perms.convert).toBe('Waitlist.entries.convert');
        expect(perms.reorder).toBe('Waitlist.entries.reorder');
        // The five stay, so a module with extras still gets its CRUD.
        expect(perms.delete).toBe('Waitlist.entries.delete');
    });

    it('accepts a different separator, so the vocabulary is not ours to pick', () => {
        expect(createPermissions('users', undefined, { separator: ':' }).create).toBe(
            'users:create'
        );
        expect(
            createPermissions('acl/users', ['ban'], { separator: '/' }).ban
        ).toBe('acl/users/ban');
    });

    it('normalises a trailing separator, so both spellings agree', () => {
        expect(createPermissions('Catalog.work_types.').index).toBe('Catalog.work_types.index');
        expect(createPermissions('Catalog.work_types...').index).toBe('Catalog.work_types.index');
        expect(createPermissions('  Catalog.work_types  ').index).toBe(
            'Catalog.work_types.index'
        );
        expect(createPermissions('a::', undefined, { separator: '::' }).view).toBe('a::view');
    });

    it('refuses an empty prefix instead of building `.create`', () => {
        expect(() => createPermissions('')).toThrow(/needs a prefix/);
        expect(() => createPermissions('   ')).toThrow(/needs a prefix/);
        expect(() => createPermissions('...')).toThrow(/needs a prefix/);
    });

    it('refuses an extra that would overwrite one of the five', () => {
        // Silently merging would let a module ship two spellings of `delete`,
        // which is the drift this exists to prevent.
        expect(() => createPermissions('x', ['delete'])).toThrow(/cannot be redeclared/);
        expect(() => createPermissions('x', ['notify', 'index'])).toThrow(/'index'/);
    });

    it('does not share state between calls', () => {
        const a = createPermissions('A.a', ['only_a']);
        const b = createPermissions('B.b');
        expect(a.index).toBe('A.a.index');
        expect(b.index).toBe('B.b.index');
        expect('only_a' in b).toBe(false);
    });

    it('is the same string wherever it is read — the point of the file', () => {
        // The drift it prevents: an action, a route and a view each retyping
        // the permission, one of them differently.
        const perms = createPermissions('Waitlist.entries', ['notify']);
        const onTheAction = perms.notify;
        const onTheRoute = perms.index;
        const inAView = perms.notify;
        expect(onTheAction).toBe(inAView);
        expect(onTheRoute).not.toBe(onTheAction);
    });
});
