---
layout: home

hero:
  name: Phalanx
  text: REST and auth for Vue 3 admin panels
  tagline: Declare a resource once and get its service, queries, mutations and custom actions — with session handling, typed errors and cache invalidation already wired.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Why Phalanx
      link: /concepts/why-phalanx

features:
  - title: Beyond CRUD
    details: Custom operations carry their permission, confirmation, notification and cache invalidation as metadata, so a view calls one mutation instead of wiring four concerns.
  - title: Session handling included
    details: Access token in memory, refresh token in an HttpOnly cookie, one refresh in flight with concurrent 401s queued behind it.
  - title: Inferred types
    details: Custom service methods appear on the generated queries and mutations with their own argument and return types. Nothing is declared twice.
---
