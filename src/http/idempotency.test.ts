import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateIdempotencyKey, IDEMPOTENCY_HEADER, useIdempotencyKey } from './idempotency';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('generateIdempotencyKey', () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
    });

    it('produces a v4-shaped key', () => {
        expect(generateIdempotencyKey()).toMatch(UUID);
    });

    it('produces a different key each time', () => {
        const keys = new Set(Array.from({ length: 50 }, generateIdempotencyKey));
        expect(keys.size).toBe(50);
    });

    it('falls back to a shaped key when randomUUID is unavailable', () => {
        vi.stubGlobal('crypto', {});
        expect(generateIdempotencyKey()).toMatch(UUID);
    });
});

describe('useIdempotencyKey', () => {
    beforeEach(() => {
        sessionStorage.clear();
    });

    it('starts empty and generates on ensure', () => {
        const idem = useIdempotencyKey({ scope: 'create' });
        expect(idem.key.value).toBeNull();
        const key = idem.ensure();
        expect(key).toMatch(UUID);
        expect(idem.key.value).toBe(key);
    });

    it('returns the same key on repeated ensure', () => {
        const idem = useIdempotencyKey({ scope: 'create' });
        expect(idem.ensure()).toBe(idem.ensure());
    });

    it('rotate replaces the key', () => {
        const idem = useIdempotencyKey({ scope: 'create' });
        const first = idem.ensure();
        const second = idem.rotate();
        expect(second).not.toBe(first);
        expect(idem.key.value).toBe(second);
    });

    it('survives a reload through sessionStorage', () => {
        const key = useIdempotencyKey({ scope: 'create' }).ensure();
        // a second composable in a fresh page load, same scope
        expect(useIdempotencyKey({ scope: 'create' }).key.value).toBe(key);
    });

    it('keeps scopes apart', () => {
        const a = useIdempotencyKey({ scope: 'create' }).ensure();
        const b = useIdempotencyKey({ scope: 'update' }).ensure();
        expect(a).not.toBe(b);
    });

    it('does not persist when asked not to', () => {
        useIdempotencyKey({ scope: 'volatile', persist: false }).ensure();
        expect(sessionStorage.getItem('idempotency:volatile')).toBeNull();
        expect(useIdempotencyKey({ scope: 'volatile', persist: false }).key.value).toBeNull();
    });

    it('clear removes it from storage too', () => {
        const idem = useIdempotencyKey({ scope: 'create' });
        idem.ensure();
        idem.clear();
        expect(idem.key.value).toBeNull();
        expect(sessionStorage.getItem('idempotency:create')).toBeNull();
    });

    it('degrades to in-memory when storage throws', () => {
        const boom = () => {
            throw new Error('blocked');
        };
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom);
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom);

        const idem = useIdempotencyKey({ scope: 'private-mode' });
        const key = idem.ensure();
        expect(key).toMatch(UUID);
        expect(idem.ensure()).toBe(key);

        vi.restoreAllMocks();
    });

    it('exports the header name', () => {
        expect(IDEMPOTENCY_HEADER).toBe('Idempotency-Key');
    });
});
