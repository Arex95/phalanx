import { AuthTokenPaths } from '@/types';
import { safeGet } from '@utils/objects';

/**
 * Extracts the access token from a response object using a dot-notation
 * path. There is no equivalent for the refresh token: it never appears in a
 * JSON body the library reads — it travels as an `HttpOnly` cookie set by
 * the backend, invisible to this code by design (see `refreshTokens.ts`).
 * Throws when the path is missing or the value is not a string.
 */
export const extractAccessToken = (
  data: unknown,
  tokenPaths: AuthTokenPaths,
  errorSource: string
): string => {
  const accessTokenPath = tokenPaths?.accessTokenPath || 'access_token';

  if (!data || typeof data !== 'object') {
    throw new Error(`${errorSource}_ERROR: No data received.`);
  }

  const dataObj = data as Record<string, unknown>;
  const accessToken = safeGet(dataObj, accessTokenPath.split('.'));

  if (!accessToken || typeof accessToken !== 'string') {
    throw new Error(
      `${errorSource}_ERROR: Access token not found or invalid at path '${accessTokenPath}' in response.`
    );
  }

  return accessToken;
};
