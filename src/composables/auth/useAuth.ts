import { getEndpointsConfig } from "@config/global/endpointsConfig";
import { getTokenPathsConfig } from "@config/global/tokenPathsConfig";
import { getCallbacksConfig } from "@config/global/callbacksConfig";
import { AuthResponse, AuthTokenPaths, Fetcher } from "@/types";
import { extractAccessToken } from "@services/extractTokens";
import { setAccessToken } from "@services/accessToken";
import { getDefaultAuthFetcher } from "@/config/auth/authFetcher";

/**
 * Auth composable: login, logout. No `persistence` parameter anymore —
 * there is nothing to persist. The access token this returns is held in
 * memory only (`accessToken.ts`); the refresh token, if the backend issues
 * one, arrives as an `HttpOnly` cookie this code never sees.
 *
 * @param {Fetcher} [fetcher] - Optional fetcher function to use for auth requests. If not provided, uses the default configured fetcher.
 *
 * @example
 * ```typescript
 * const { login, logout } = useAuth();
 * await login({ email, password });
 * ```
 */
export function useAuth(fetcher?: Fetcher) {
  const endpoints = getEndpointsConfig();

  const getFetcher = (): Fetcher => {
    return fetcher || getDefaultAuthFetcher();
  };

  /**
   * Logs out the user by making a POST request to the logout endpoint,
   * clearing the in-memory access token, and reloading the page.
   *
   * @param {Record<string, unknown>} [params={}] - Optional parameters to send with the logout request.
   * @returns {Promise<void>}
   */
  const logout = async (params: Record<string, unknown> = {}): Promise<void> => {
    try {
      await getFetcher()({
        method: 'POST',
        url: endpoints.LOGOUT,
        data: params,
      });
    } catch {
      // Logout MUST proceed regardless of network/server outcome — the user
      // intent is to terminate the session locally even if the backend call
      // fails. Errors are swallowed by design.
    } finally {
      setAccessToken(null);
      const { onLogout } = getCallbacksConfig();
      if (onLogout) {
        onLogout();
      } else if (typeof window !== 'undefined') {
        window.location.reload();
      }
    }
  };

  /**
   * Authenticates the user by making a POST request to the login endpoint
   * and holding the received access token in memory.
   *
   * @param {Record<string, unknown>} params - The authentication parameters (e.g., username, password).
   * @param {AuthTokenPaths} [tokenPaths] - Optional configuration for the dot-notation path where the access token is located in the API response.
   * @returns {Promise<AuthResponse>} The authentication response.
   * @throws {Error} If the login request fails, or if the access token is not found or invalid in the response.
   */
  const login = async (
    params: Record<string, unknown> = {},
    tokenPaths: AuthTokenPaths = getTokenPathsConfig()
  ): Promise<AuthResponse> => {
    const data = await getFetcher()({
      method: 'POST',
      url: endpoints.LOGIN,
      data: params,
    }) as AuthResponse;

    const accessToken = extractAccessToken(data, tokenPaths, "LOGIN");
    setAccessToken(accessToken);
    return data;
  };

  return {
    logout,
    login
  };
}
