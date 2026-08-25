import { AuthTokenPaths, TokenValidationResult } from '@/types';
import { safeGet } from '@utils/objects';

/**
 * Extracts access + refresh tokens from a response object using dot-notation
 * paths. Throws when the path is missing or the value is not a string.
 */
export const extractAndValidateTokens = (
  data: unknown,
  tokenPaths: AuthTokenPaths,
  errorSource: string
): TokenValidationResult => {
  const accessTokenPath = tokenPaths?.accessTokenPath || 'access_token';
  const refreshTokenPath = tokenPaths?.refreshTokenPath || 'refresh_token';

  if (!data || typeof data !== 'object') {
    throw new Error(`${errorSource}_ERROR: No data received.`);
  }

  const dataObj = data as Record<string, unknown>;
  const accessToken = safeGet(dataObj, accessTokenPath.split('.'));
  const refreshToken = safeGet(dataObj, refreshTokenPath.split('.'));

  if (!accessToken || typeof accessToken !== 'string') {
    throw new Error(
      `${errorSource}_ERROR: Access token not found or invalid at path '${accessTokenPath}' in response.`
    );
  }

  if (!refreshToken || typeof refreshToken !== 'string') {
    throw new Error(
      `${errorSource}_ERROR: Refresh token not found or invalid at path '${refreshTokenPath}' in response.`
    );
  }

  return { accessToken, refreshToken };
};
