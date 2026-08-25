import { getTokenConfig } from '@config/global/tokensConfig';
import { getDecryptedItem, storeEncryptedItem } from '@utils/storage';
import { TokensConfig } from '@/types';
import { LocationPreference } from '@/types/SessionConfig';
import { jwtDecode } from 'jwt-decode';
import { getAppKey } from '@/config/global';
import { getStorage, getSessionStorage, getCookieStorage, isServer } from '@utils/ssr';

/**
 * Removes all stored authentication credentials (access + refresh tokens)
 * from the specified storage location(s).
 *
 * With location='any', ALL storage locations are cleared — including cookies.
 * This prevents orphaned tokens surviving a logout.
 */
export const cleanCredentials = async (
  location: LocationPreference
): Promise<void> => {
  const tokensConfig = getTokenConfig();
  const keys = Object.keys(tokensConfig) as (keyof TokensConfig)[];
  const tokenItemKeys = keys.map((k) => tokensConfig[k]);

  const removeCookies = () => {
    const cookieStorage = getCookieStorage();
    tokenItemKeys.forEach((itemKey) =>
      cookieStorage.removeItem(itemKey, { path: '/' })
    );
  };

  const removeFromStorage = (storage: Storage | null) => {
    tokenItemKeys.forEach((itemKey) => storage?.removeItem(itemKey));
  };

  if (location === 'cookie') {
    removeCookies();
    return;
  }

  if (isServer) {
    removeCookies();
    return;
  }

  // Client — clear every requested location
  if (location === 'local' || location === 'any') {
    removeFromStorage(getStorage());
  }
  if (location === 'session' || location === 'any') {
    removeFromStorage(getSessionStorage());
  }
  // 'any' also clears cookies so that tokens stored explicitly with
  // location='cookie' don't survive a logout
  if (location === 'any') {
    removeCookies();
  }
};

/**
 * Retrieves and decrypts the access token from the specified storage location.
 */
export const getAuthToken = async (
  secretKey: string,
  location: LocationPreference
): Promise<string | null> => {
  const tokensConfig = getTokenConfig();
  return getDecryptedItem(tokensConfig.ACCESS_TOKEN, secretKey, location);
};

/**
 * Retrieves and decrypts the refresh token from the specified storage location.
 */
export const getAuthRefreshToken = async (
  secretKey: string,
  location: LocationPreference
): Promise<string | null> => {
  const tokensConfig = getTokenConfig();
  return getDecryptedItem(tokensConfig.REFRESH_TOKEN, secretKey, location);
};

/**
 * Encrypts and stores the access token.
 */
export const storeAuthToken = async (
  token: string,
  secretKey: string,
  location: LocationPreference
): Promise<void> => {
  const tokensConfig = getTokenConfig();
  await storeEncryptedItem(tokensConfig.ACCESS_TOKEN, token, secretKey, location);
};

/**
 * Encrypts and stores the refresh token.
 */
export const storeAuthRefreshToken = async (
  token: string,
  secretKey: string,
  location: LocationPreference
): Promise<void> => {
  const tokensConfig = getTokenConfig();
  await storeEncryptedItem(tokensConfig.REFRESH_TOKEN, token, secretKey, location);
};

/**
 * Verifies the current user's authentication status by checking for a
 * valid, unexpired access token across all storage locations.
 *
 * Returns false (without throwing) if the token is missing, malformed, or expired.
 */
export const verifyAuth = async (): Promise<boolean> => {
  const token = await getAuthToken(getAppKey(), 'any');
  if (!token) return false;

  try {
    const decoded: { exp?: number } = jwtDecode(token);
    const currentTime = Date.now() / 1000;

    if (typeof decoded.exp !== 'number') {
      await cleanCredentials('any');
      return false;
    }

    if (decoded.exp <= currentTime) {
      return false;
    }

    return true;
  } catch {
    await cleanCredentials('any');
    return false;
  }
};
