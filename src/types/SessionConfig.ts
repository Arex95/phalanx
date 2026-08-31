/**
 * Defines the possible storage locations for the generic `storeEncryptedItem`/
 * `getDecryptedItem` utilities in `@utils/storage`. Not used by the auth flow
 * anymore — the access token lives in memory only, and the refresh token
 * lives in an `HttpOnly` cookie this library never touches — but still a
 * real option for a consumer encrypting its own non-token data client-side.
 * - `local`: `localStorage`, persists after the browser is closed.
 * - `session`: `sessionStorage`, cleared when the browser is closed.
 * - `cookie`: a JS-writable cookie (never `HttpOnly` — see `getCookieStorage`).
 * - `any`: used for retrieval operations to check all storage locations.
 */
export type LocationPreference = "local" | "session" | "cookie" | "any";
