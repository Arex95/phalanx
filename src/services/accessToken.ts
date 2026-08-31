import { computed, ref, type ComputedRef } from "vue";

/**
 * The access token lives in memory ONLY — never localStorage, sessionStorage,
 * or a JS-writable cookie. This is deliberate: an in-memory value is what
 * makes it unreachable by an XSS payload trying to read persisted storage.
 * A page reload clears it by design; recovering it depends on `refreshTokens()`
 * succeeding against a backend-held session (the refresh token itself never
 * reaches this library — see `refreshTokens.ts`).
 *
 * This is a module-level singleton — correct in a browser tab (one user,
 * one JS runtime), but never call `setAccessToken`/`login`/`refreshTokens`
 * from *server-side* request-handling code in a Node SSR app: a single
 * Node process serves many users' requests on the same module instance, so
 * a per-request token would leak across concurrent requests. This was
 * already true in spirit before this token lived in memory — the old
 * storage-backed version's `getCookieStorage()` was a no-op in SSR (no
 * `document`), so it never functioned there either. Real SSR auth (a Nuxt
 * server plugin reading that request's own cookie and setting the
 * `Authorization` header directly) was always meant to bypass this module
 * entirely — see `AxiosServiceOptions.setupAuthInterceptors` and the
 * README's Nuxt section.
 */
const _accessToken = ref<string | null>(null);

export function setAccessToken(token: string | null): void {
  _accessToken.value = token;
}

export function getAccessToken(): string | null {
  return _accessToken.value;
}

/** Reactive read-only view, for UI/router guards that want to react to
 * login/logout without polling. */
export const accessToken: ComputedRef<string | null> = computed(() => _accessToken.value);

/**
 * Reflects PRESENCE of a token, not its freshness — it does not decode or
 * check expiry, and won't flip to `false` on its own the instant a token
 * expires (nothing re-evaluates a `computed` on the mere passage of time).
 * It answers "do we currently hold a session token", which is what most UI
 * (nav guards deciding whether to *attempt* a request, realtime connection
 * state) actually wants reactively. For "is this token still valid right
 * now", checked on demand rather than reactively, use `verifyAuth()` in
 * `credentials.ts` — the router's navigation guard uses that one, precisely
 * because it needs the imperative, expiry-aware answer at that instant.
 */
export const isAuthenticated: ComputedRef<boolean> = computed(() => _accessToken.value !== null);
