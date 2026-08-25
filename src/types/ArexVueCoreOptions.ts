import { AxiosServiceOptions } from "./AxiosServiceOptions";

/**
 * Configuration object for initializing the `@arex95/vue-core` plugin.
 * Passed as the second argument to `app.use(ArexVueCore, options)`.
 */
export interface ArexVueCoreOptions {
  /** Secret key used to encrypt tokens at rest (AES-CBC via Web Crypto). */
  appKey: string;

  /** Authentication API endpoints. */
  endpoints: {
    login: string;
    refresh: string;
    logout: string;
  };

  /** Storage keys used to persist tokens (localStorage / sessionStorage / cookies). */
  tokenKeys: {
    accessToken: string;
    refreshToken: string;
  };

  /** Dot-notation paths to extract tokens from the LOGIN response. */
  tokenPaths: {
    accessToken: string;
    refreshToken: string;
  };

  /** Dot-notation paths to extract tokens from the REFRESH response. */
  refreshTokenPaths: {
    accessToken: string;
    refreshToken: string;
  };

  /**
   * Body key used when POSTing the refresh token to the refresh endpoint.
   * Default: `'refresh_token'` (OAuth2 / Laravel convention).
   * Set to `'refreshToken'` for backends with camelCase conventions (Spring, NestJS).
   */
  refreshTokenBodyKey?: string;

  /** Axios instance options (baseURL, headers, timeout, interceptors, …). */
  axios: AxiosServiceOptions;

  /**
   * Called when a refresh attempt fails (e.g. to redirect to /login).
   * Falls back to `window.location.reload()` when not provided.
   */
  onRefreshFailed?: () => void;

  /**
   * Called after a successful logout (e.g. to redirect to /login).
   * Falls back to `window.location.reload()` when not provided.
   */
  onLogout?: () => void;
}
