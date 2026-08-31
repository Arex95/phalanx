import { getEndpointsConfig } from '@config/global/endpointsConfig';
import { getRefreshTokenPathsConfig } from '@config/global/tokenPathsConfig';
import { getCallbacksConfig } from '@config/global/callbacksConfig';
import { AuthResponse, AuthTokenPaths, Fetcher } from '@/types';
import { extractAccessToken } from '@services/extractTokens';
import { setAccessToken } from '@services/accessToken';
import { getDefaultAuthFetcher } from '@/config/auth/authFetcher';

/**
 * Refreshes the access token.
 *
 * No refresh token is read or sent by this function — it is expected to
 * live in an `HttpOnly` cookie that the browser attaches to this request on
 * its own (requires the fetcher's `withCredentials`/`credentials: 'include'`
 * to be enabled, and the backend to have set that cookie on login/refresh).
 * This library has no code path that could read that cookie even if it
 * wanted to — that is the point.
 *
 * On failure: clears the in-memory access token, invokes `onRefreshFailed`
 * if configured, and rethrows so callers can react.
 */
export const refreshTokens = async (fetcher?: Fetcher): Promise<AuthResponse> => {
  const tokenPaths: AuthTokenPaths = getRefreshTokenPathsConfig();
  const endpoints = getEndpointsConfig();
  const getFetcher = (): Fetcher => fetcher ?? getDefaultAuthFetcher();

  try {
    const data = await getFetcher()({
      method: 'POST',
      url: endpoints.REFRESH,
    }) as AuthResponse;

    const accessToken = extractAccessToken(data, tokenPaths, 'REFRESH');
    setAccessToken(accessToken);

    return data;
  } catch (error) {
    setAccessToken(null);
    const { onRefreshFailed } = getCallbacksConfig();
    if (onRefreshFailed) {
      onRefreshFailed();
    } else if (typeof window !== 'undefined') {
      window.location.reload();
    }
    throw error;
  }
};
