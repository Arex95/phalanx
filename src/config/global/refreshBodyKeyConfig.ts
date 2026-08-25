/**
 * Body key used when POSTing the refresh token to the refresh endpoint.
 *
 * Two reasons this is its own concept:
 *   1. The shape of the request body is a contract with the backend
 *      (`refreshToken` in Spring/Nest, `refresh_token` in OAuth2/Laravel).
 *   2. It is independent from `refreshTokenPaths.refreshTokenPath`, which is a
 *      dot-notation path used to **extract** the token from the response.
 *      Conflating the two was a v5.x bug: anidated paths (`data.refresh_token`)
 *      ended up as literal body keys.
 */

let _bodyKey = 'refresh_token';
let _frozen = false;

/**
 * Configures the body key for the refresh token request. Called once by the
 * plugin install. Subsequent calls are ignored to keep the singleton stable.
 */
export const configRefreshTokenBodyKey = (key?: string): void => {
  if (_frozen) return;
  if (key && key.trim() !== '') {
    _bodyKey = key;
  }
  _frozen = true;
};

export const getRefreshTokenBodyKey = (): string => _bodyKey;
