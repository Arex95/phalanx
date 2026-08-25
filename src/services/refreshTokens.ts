import { getAuthRefreshToken } from '@/services/credentials';
import { getSessionPersistence } from '@config/global/sessionConfig';
import { getAppKey } from '@config/global/keyConfig';
import { getEndpointsConfig } from '@config/global/endpointsConfig';
import { getRefreshTokenPathsConfig } from '@config/global/tokenPathsConfig';
import { getRefreshTokenBodyKey } from '@config/global/refreshBodyKeyConfig';
import { getCallbacksConfig } from '@config/global/callbacksConfig';
import { AuthResponse, AuthTokenPaths, Fetcher } from '@/types';
import { extractAndValidateTokens } from '@services/extractTokens';
import { storeTokens } from '@services/storeTokens';
import { cleanCredentials } from '@/services/credentials';
import { getDefaultAuthFetcher } from '@/config/auth/authFetcher';

/**
 * Refreshes the access and refresh tokens.
 *
 * The refresh token is sent in the request body under the key configured via
 * `refreshTokenBodyKey` (default `'refresh_token'`). This is a flat, literal
 * key — it has no relationship with the dot-notation paths used to extract
 * tokens from the response.
 *
 * On failure: clears credentials, invokes the `onRefreshFailed` callback if
 * configured, and rethrows so callers can react.
 */
export const refreshTokens = async (fetcher?: Fetcher): Promise<AuthResponse> => {
  const tokenPaths: AuthTokenPaths = getRefreshTokenPathsConfig();
  const endpoints   = getEndpointsConfig();
  const secretKey   = getAppKey();
  const persistence = await getSessionPersistence();
  const getFetcher  = (): Fetcher => fetcher ?? getDefaultAuthFetcher();

  try {
    const refreshToken = await getAuthRefreshToken(secretKey, persistence);

    if (!refreshToken) {
      throw new Error('[arex-core] No refresh token found in storage.');
    }

    const data = await getFetcher()({
      method: 'POST',
      url: endpoints.REFRESH,
      data: { [getRefreshTokenBodyKey()]: refreshToken },
    }) as AuthResponse;

    const { accessToken, refreshToken: newRefreshToken } = extractAndValidateTokens(
      data,
      tokenPaths,
      'REFRESH'
    );

    await storeTokens(accessToken, newRefreshToken, persistence);

    return data;
  } catch (error) {
    await cleanCredentials(persistence);
    const { onRefreshFailed } = getCallbacksConfig();
    if (onRefreshFailed) {
      onRefreshFailed();
    } else if (typeof window !== 'undefined') {
      window.location.reload();
    }
    throw error;
  }
};
