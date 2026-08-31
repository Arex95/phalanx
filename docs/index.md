---
layout: home

hero:
  name: Phalanx
  text: The formation is the product
  tagline: An opinionated REST and auth foundation for Vue 3 admin panels. Declare the domain once — the services, queries, mutations and actions derive from it.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Why Phalanx
      link: /concepts/why-phalanx

features:
  - title: No gaps in the line
    details: CRUD is the easy 80%. Phalanx also covers the part that is not CRUD — custom operations with permissions, confirmation and cache invalidation, declared as data instead of rebuilt in every view.
  - title: Auth that does not pretend
    details: The access token lives in memory and is never persisted. The refresh token travels in an HttpOnly cookie the library cannot read by design, because a key that ships in the bundle protects nothing.
  - title: Typed from the service down
    details: A service's custom methods appear on its queries and mutations with their real argument and return types, inferred — not declared twice.
---
