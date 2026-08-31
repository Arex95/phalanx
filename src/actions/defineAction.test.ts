import { describe, expect, it } from 'vitest';
import { defineAction } from './defineAction';

describe('defineAction', () => {
    it('attaches meta without altering the function', async () => {
        async function confirm(this: { id: string }) {
            return this.id;
        }
        const tagged = defineAction(confirm, { permission: 'x.y.z' });

        expect(tagged.meta).toEqual({ permission: 'x.y.z' });
        expect(tagged).toBe(confirm);
    });

    // Regression guard for a real design constraint: the proxy in
    // `createDomainMutations` does `.bind(service)` on whatever `defineAction`
    // returns. An arrow function ignores `.bind()` — `this` stays lexically
    // scoped to wherever it was defined, never the Service — so a
    // `defineAction`-wrapped method MUST be a `function` expression to work
    // through that proxy at all.
    it('preserves `this` binding when bound, which only works for function expressions', async () => {
        const service = { id: 'service-id' };

        async function realMethod(this: { id: string }) {
            return this.id;
        }
        const taggedFunction = defineAction(realMethod, {});
        const boundFunction = taggedFunction.bind(service);
        expect(await boundFunction()).toBe('service-id');

        const arrowMethod = () => Promise.resolve(this);
        const taggedArrow = defineAction(arrowMethod, {});
        const boundArrow = taggedArrow.bind(service);
        // `.bind()` always returns a new function object, even for an arrow —
        // but calling it still resolves `this` lexically, exactly like the
        // unbound original, never to `service`. This is the failure mode
        // `defineAction`'s doc comment warns about.
        expect(await boundArrow()).toBe(await arrowMethod());
        expect(await boundArrow()).not.toBe(service);
    });

    it('does not mutate the meta object reference passed in', () => {
        const meta = { permission: 'a.b.c' };
        function fn() {
            return Promise.resolve(undefined);
        }
        const tagged = defineAction(fn, meta);
        expect(tagged.meta).toBe(meta);
    });
});
