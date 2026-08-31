import { AxiosServiceOptions } from "./AxiosServiceOptions";
import { CsrfConfig } from "./Csrf";
import { EncryptionConfig } from "./Encryption";

/**
 * Configuration object for initializing the `@arex95/vue-core` plugin.
 * Passed as the second argument to `app.use(ArexVueCore, options)`.
 *
 * No `appKey` and no `tokenKeys`: the access token lives in memory only and
 * the refresh token lives in an `HttpOnly` cookie the backend manages —
 * there is nothing left for this library to encrypt or address by storage
 * key. Set `axios.withCredentials: true` so that cookie is actually sent.
 */
export interface ArexVueCoreOptions {
  /** Authentication API endpoints. */
  endpoints: {
    login: string;
    refresh: string;
    logout: string;
  };

  /** Dot-notation path to extract the access token from the LOGIN response. */
  tokenPaths: {
    accessToken: string;
  };

  /** Dot-notation path to extract the access token from the REFRESH response. */
  refreshTokenPaths: {
    accessToken: string;
  };

  /**
   * Double Submit Cookie config for the refresh/logout endpoints. Optional —
   * omit if the backend doesn't require it yet.
   */
  csrf?: CsrfConfig;

  /**
   * Public key for `encryptField` (client-side field-level encryption of
   * outbound user data — unrelated to the auth token flow above). Optional,
   * same as `csrf`: omit if this project doesn't use `encryptField`. Can
   * also be set separately via `configEncryption()` for a project that
   * doesn't want it tied to plugin install order.
   */
  encryption?: EncryptionConfig;

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
