import type { CsrfConfig } from "@/types";

/**
 * CSRF protection for the refresh/logout endpoints, which rely on a cookie
 * the browser attaches automatically — the one case in this library's auth
 * flow where a cross-site request could ride along uninvited.
 *
 * This implements the Double Submit Cookie pattern (OWASP's recommendation
 * for stateless APIs): the backend sets a second, JS-*readable* cookie
 * (`cookieName`) alongside the `HttpOnly` refresh cookie. This library reads
 * that value and echoes it back as a request header (`headerName`), only on
 * requests to those two endpoints (see `axiosConfig.ts`); the backend
 * accepts the request only if the header matches its own cookie. That
 * second cookie is not a secret — its only job is proving the request
 * originated from a page that could read it, which a cross-site attacker's
 * page cannot.
 *
 * Optional: a consumer whose backend doesn't require this (e.g. it isn't
 * using cookie-based auth at all yet) simply never calls `configCsrf`, and
 * no header is added.
 */
let csrfConfig: CsrfConfig | null = null;

export function configCsrf(config: CsrfConfig): void {
  csrfConfig = config;
}

export function getCsrfConfig(): CsrfConfig | null {
  return csrfConfig;
}
