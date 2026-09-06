import { describe, expect, it } from 'vitest';
import { RestStd } from '@/rest/RestStd';
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

    // The failure the doc comment warns about, in the shape a consumer
    // actually meets it: an arrow works in the class that declares it —
    // `this` is lexically the class in a `static` initializer — and only
    // starts lying once the service is subclassed. `createDomainMutations`
    // binds to the concrete service, so the `function` form follows the
    // subclass and the arrow keeps resolving against the parent's
    // `resource`, with nothing raised.
    it('follows the subclass through .bind(), which an arrow does not', async () => {
        class Base {
            static resource = 'users';
            static describe(this: { resource: string }) {
                return Promise.resolve(this.resource);
            }

            static viaFunction = defineAction(function (this: typeof Base) {
                return Promise.resolve(this.resource);
            }, {});

            static viaArrow = defineAction(() => Promise.resolve(Base.resource), {});
        }
        class Sub extends Base {
            static resource = 'admin/users';
        }

        // This is verbatim what createDomainMutations does before calling.
        const bind = (fn: (...a: never[]) => Promise<unknown>, service: unknown) =>
            fn.bind(service as never);

        expect(await bind(Sub.viaFunction, Sub)()).toBe('admin/users');
        expect(await bind(Base.viaFunction, Base)()).toBe('users');

        // The arrow ignores the binding and answers for the parent.
        expect(await bind(Sub.viaArrow, Sub)()).toBe('users');
    });

    // Type-level guard for the TS2683/TS2347 pair. The assertions below are
    // runtime, but the value of this test is that it must COMPILE: it fails
    // the build if `ActionFn` stops declaring `this` (TS2683 on `plain`), or
    // if the second overload is dropped (TS2345 on `annotated`).
    it('types `this` contextually, and still accepts a narrower annotation', async () => {
        class Service extends RestStd {
            static resource = 'users';
            static tenantId = 'acme';

            // Stubbed so the test never reaches a fetcher.
            static customRequest<T>(config: { method: string; url: string }): Promise<T> {
                return Promise.resolve(config.url as T);
            }

            // No annotation. `this` must be typed by the contextual signature
            // alone — this is the exact line that failed with TS2683, and
            // whose `<string>` argument then failed with TS2347.
            static plain = defineAction(function (id: string) {
                return this.customRequest<string>({
                    method: 'POST',
                    url: `${this.resource}/${id}`
                });
            }, {});

            // Explicit and narrower, to reach a static of this class that
            // `typeof RestStd` does not know about.
            static annotated = defineAction(function (this: typeof Service, id: string) {
                return this.customRequest<string>({
                    method: 'POST',
                    url: `${this.tenantId}/${id}`
                });
            }, {});
        }

        expect(await Service.plain.call(Service, '1')).toBe('users/1');
        expect(await Service.annotated.call(Service, '1')).toBe('acme/1');
    });
});
