/**
 * Dot-notation paths used to extract tokens from auth responses.
 *
 * @example { accessTokenPath: 'data.access_token', refreshTokenPath: 'data.refresh_token' }
 */
export interface AuthTokenPaths {
  accessTokenPath?: string;
  refreshTokenPath?: string;
}

/**
 * Generic auth response payload. The library does not assume a fixed shape;
 * tokens are extracted via the configured dot-notation paths.
 */
export interface AuthResponse {
  [key: string]: unknown;
}
