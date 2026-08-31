/**
 * Dot-notation path used to extract the access token from an auth response.
 * No `refreshTokenPath` — the refresh token never appears in a JSON body
 * this library reads (see `services/refreshTokens.ts`).
 *
 * @example { accessTokenPath: 'data.access_token' }
 */
export interface AuthTokenPaths {
  accessTokenPath?: string;
}

/**
 * Generic auth response payload. The library does not assume a fixed shape;
 * the token is extracted via the configured dot-notation path.
 */
export interface AuthResponse {
  [key: string]: unknown;
}
