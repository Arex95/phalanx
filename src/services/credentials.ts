import { getAccessToken, setAccessToken } from '@services/accessToken';
import { jwtDecode } from 'jwt-decode';

/**
 * Verifies the current user's authentication status by checking the
 * in-memory access token's presence and expiry. Nothing is read from
 * storage — there is nothing stored to read (see `accessToken.ts`).
 *
 * Returns false (without throwing) if the token is missing, malformed, or
 * expired. Synchronous: unlike the old storage-backed version, there is no
 * I/O left to await.
 */
export const verifyAuth = (): boolean => {
  const token = getAccessToken();
  if (!token) return false;

  try {
    const decoded: { exp?: number } = jwtDecode(token);
    const currentTime = Date.now() / 1000;

    if (typeof decoded.exp !== 'number') {
      setAccessToken(null);
      return false;
    }

    if (decoded.exp <= currentTime) {
      setAccessToken(null);
      return false;
    }

    return true;
  } catch {
    setAccessToken(null);
    return false;
  }
};
