# Project structure

Phalanx does not require a folder layout. It does assume one shape, and the
composables read better when you follow it: **one module per business area,
with the data layer declared once and imported everywhere.**

What follows is the layout of a panel with twenty-one services in production,
not an example written for a documentation page.

## The tree

```
src/
├── core/                       # what every module uses
│   ├── http/                   # interceptors, error mapping
│   ├── auth/                   # session glue
│   └── queryClient.ts
└── modules/
    └── work-type/
        ├── contracts/          # the types the API speaks
        ├── entities/           # keys, model, field definitions
        ├── services/           # the RestStd class
        ├── composables/        # queries + mutations, and view logic
        ├── validations/        # schemas
        ├── views/              # Index, Create, Update
        ├── routes/
        └── locales/
```

Three rules carry it, and they are worth more than the folder names:

- **A module is a business area, not a page.** `billing`, `scheduling`,
  `work-type` — not `forms` or `tables`.
- **No module imports another module.** Shared need moves down into `core/`.
  Sideways imports are how two features become one.
- **`core/` never imports upward.** An interceptor that reaches into a module
  has inverted the dependency, and the module can no longer be deleted.

## The five files that matter

### 1 · Contracts — what the API speaks

```ts
// contracts/work-type.contracts.ts
export interface WorkType {
    id: string;
    name: string;
    durationMinutes: number;
}
```

Generated from the schema where you have one — see
[Typing from OpenAPI](/guide/openapi).

### 2 · Keys — named once, never inline

```ts
// entities/work-type.keys.ts
export const WorkTypeKeys = {
    list: 'catalog:work-type:list',
    item: 'catalog:work-type:item'
} as const satisfies BaseModelKeys;
```

Namespaced (`catalog:`) so two modules exposing a `list` do not collide, and
`as const satisfies` so a typo is a compile error rather than a cache that
silently never invalidates.

::: tip Why this file exists at all
A cache key written inline in three places is three chances to write it
differently. The bug that produces — a mutation that succeeds while the list
keeps showing stale rows — has no error, no log and no failing test.
:::

### 3 · Service — usually three lines

```ts
// services/work-type.service.ts
import { RestStd } from '@arex95/phalanx';

export default class WorkTypeService extends RestStd {
    static resource = 'admin/work-types';
}
```

That is a complete service. The eleven CRUD methods are inherited; adding
anything here means the API does something CRUD does not cover.

### 4 · Composable — the module's entry point

```ts
// composables/useWorkType.ts
export function useWorkType() {
    const queries = createDomainQueries({
        service: WorkTypeService,
        keys: WorkTypeKeys,
        model: WorkTypeModel
    });
    const mutations = createDomainMutations({
        service: WorkTypeService,
        keys: WorkTypeKeys,
        model: WorkTypeModel
    });
    return { queries, mutations };
}
```

**This is the file the rest of the application imports.** Views never import the
service, the keys or the model directly. One entry point per module means you
can change how the data layer is assembled without touching a single view.

### 5 · View — as thin as the composable allows

```vue
<script setup lang="ts">
const { queries, mutations } = useWorkType();
const { data, isPending } = queries.getAll({ params: filters });
</script>
```

## Custom operations

Anything that is not CRUD goes on the service with its metadata attached, not in
the view that happens to trigger it:

```ts
export default class AppointmentService extends RestStd {
    static resource = 'admin/appointments';

    static confirm = defineAction(
        (id: string) => this.customRequest<Appointment>({
            method: 'POST',
            url: `admin/appointments/${id}/confirm`
        }),
        {
            permission: 'appointments.confirm',
            requiresConfirmation: true,
            confirmMessageKey: 'appointment.confirm.ask',
            successMessageKey: 'appointment.confirm.ok',
            invalidate: ['catalog:appointment:list']
        }
    );
}
```

The view becomes one line:

```vue
<button :disabled="!confirm.isAuthorized.value" @click="confirm.mutate(id)">
```

**The reason to put it here rather than in the view:** the second screen that
confirms an appointment gets the same permission check, the same dialog and the
same invalidation for free. When those live in the view, the second screen gets
whatever its author remembered.

## Wiring the injections once

`checkPermission`, `translate`, `requestConfirmation` and `notify` are the same
in every module. Write them once in `core/` and spread them:

```ts
// core/mutations/domainDefaults.ts
export const actionDefaults = {
    checkPermission: (p: string) => useAuth().can(p),
    translate: (k: string) => i18n.global.t(k),
    requestConfirmation: (request, onAccept, onReject) =>
        confirm.require({ ...request, accept: onAccept, reject: onReject }),
    notify: ({ severity, message }) => toast.add({ severity, detail: message })
};
```

```ts
const mutations = createDomainMutations({
    service: WorkTypeService,
    keys: WorkTypeKeys,
    ...actionDefaults
});
```

A module that forgets one of these does not fail — the concern is silently
skipped. Spreading a shared object is what stops that.

## Where things go when you are unsure

| It is… | It belongs in |
|---|---|
| a shape the API sends or receives | `contracts/` |
| a cache key, a model, a field list | `entities/` |
| an HTTP call | `services/` |
| anything a view calls | `composables/` |
| used by two modules | `core/`, moved down |
| used by one view only | that view |

## Antipatterns

**Calling a service from a view.** It bypasses the cache and the invalidation,
so one screen updates and the others do not.

**Inline cache keys.** See above — silent staleness.

**A module importing another module's composable.** The moment `billing` imports
`useClient`, neither can be deleted or moved. Move the shared piece into
`core/`.

**Action metadata in the view.** Permission and confirmation written at the call
site are permission and confirmation that the next call site will not have.

**A service with business logic.** A service maps to endpoints. Decisions about
what an operation means live in the composable, or in the action's metadata.
