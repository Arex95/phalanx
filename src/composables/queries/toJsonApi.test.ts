import { describe, expect, it } from 'vitest';
import { toJsonApi } from './toJsonApi';

describe('toJsonApi', () => {
    it('returns an empty object for null/undefined input', () => {
        expect(toJsonApi(undefined)).toEqual({});
        expect(toJsonApi(null)).toEqual({});
    });

    it('namespaces plain fields under filter[]', () => {
        expect(toJsonApi({ status: 'active' })).toEqual({ 'filter[status]': 'active' });
    });

    it('leaves already-namespaced keys untouched', () => {
        expect(toJsonApi({ 'filter[status]': 'active', include: 'branch' })).toEqual({
            'filter[status]': 'active',
            include: 'branch'
        });
    });

    it('drops null, undefined and empty-string values', () => {
        expect(toJsonApi({ a: null, b: undefined, c: '', d: 'kept' })).toEqual({ 'filter[d]': 'kept' });
    });

    it('keeps falsy-but-real values (false, 0)', () => {
        expect(toJsonApi({ active: false, count: 0 })).toEqual({
            'filter[active]': false,
            'filter[count]': 0
        });
    });

    it('maps search to a top-level search param', () => {
        expect(toJsonApi({ search: 'john' })).toEqual({ search: 'john' });
    });

    it('maps sort ascending by default, prefixes with - for desc', () => {
        expect(toJsonApi({ sort: 'name' })).toEqual({ sort: 'name' });
        expect(toJsonApi({ sort: 'name', order: 'desc' })).toEqual({ sort: '-name' });
    });

    it('converts 0-indexed page to 1-indexed page[number], defaults size to 15', () => {
        expect(toJsonApi({ page: 0 })).toEqual({ 'page[number]': 1, 'page[size]': 15 });
        expect(toJsonApi({ page: 2, size: 50 })).toEqual({ 'page[number]': 3, 'page[size]': 50 });
    });

    it('combines filters, search, sort and pagination in one call', () => {
        expect(toJsonApi({ status: 'active', search: 'john', sort: 'name', order: 'desc', page: 1, size: 20 })).toEqual({
            'filter[status]': 'active',
            search: 'john',
            sort: '-name',
            'page[number]': 2,
            'page[size]': 20
        });
    });
});
