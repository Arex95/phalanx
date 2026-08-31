import { encrypt, decrypt } from './encryption';
import { LocationPreference } from '@/types';
import { getStorage, getSessionStorage, getCookieStorage, isServer, CookieOptions } from './ssr';

/**
 * Encrypts and stores a value in the requested storage.
 *
 * | location  | where it goes               | persistence         |
 * |-----------|----------------------------|---------------------|
 * | 'cookie'  | document.cookie            | expires option      |
 * | 'local'   | localStorage               | until explicitly cleared |
 * | 'any'     | localStorage               | until explicitly cleared |
 * | 'session' | sessionStorage             | until tab closes    |
 *
 * Note: 'any' stores in localStorage (same as 'local') for maximum
 * persistence. Previously it stored in sessionStorage — that was a bug.
 *
 * In SSR environments cookies are always used regardless of location
 * (localStorage / sessionStorage do not exist on the server).
 */
export async function storeEncryptedItem(
  key: string,
  value: string,
  secretKey: string,
  location: LocationPreference,
  cookieOptions?: CookieOptions
): Promise<void> {
  const encryptedValue = await encrypt(value, secretKey);

  if (location === 'cookie' || isServer) {
    const cookieStorage = getCookieStorage();
    const defaultCookieOptions: CookieOptions = {
      expires: location === 'local' || isServer ? 365 : undefined,
      path: '/',
      secure: undefined,
      sameSite: 'Lax',
      ...cookieOptions,
    };
    cookieStorage.setItem(key, encryptedValue, defaultCookieOptions);
    return;
  }

  // 'local' and 'any' → localStorage (persistent)
  // 'session'         → sessionStorage (tab-scoped)
  const storage =
    location === 'local' || location === 'any' ? getStorage() : getSessionStorage();

  if (storage) {
    storage.setItem(key, encryptedValue);
  }
}

/**
 * Retrieves and decrypts a value from storage.
 *
 * Search order by location:
 *
 * | location  | search order                              |
 * |-----------|-------------------------------------------|
 * | 'cookie'  | cookies only                              |
 * | 'local'   | localStorage only                         |
 * | 'session' | sessionStorage only                       |
 * | 'any'     | sessionStorage → localStorage → cookies   |
 *
 * In SSR, cookies are always checked first (localStorage / sessionStorage
 * are not available on the server).
 *
 * Returns null if the key is not found or decryption fails.
 */
export async function getDecryptedItem(
  key: string,
  secretKey: string,
  location: LocationPreference
): Promise<string | null> {
  let encryptedData: string | null = null;

  // cookies
  if (location === 'cookie' || isServer) {
    const cookieStorage = getCookieStorage();
    encryptedData = cookieStorage.getItem(key);
    if (encryptedData) {
      try {
        return await decrypt(encryptedData, secretKey);
      } catch {
        return null;
      }
    }
    // Explicit 'cookie' location stops here — don't fall through
    if (location === 'cookie') return null;
  }

  // sessionStorage
  if (location === 'session' || location === 'any') {
    const ss = getSessionStorage();
    encryptedData = ss?.getItem(key) ?? null;
    if (encryptedData) {
      try {
        return await decrypt(encryptedData, secretKey);
      } catch {
        return null;
      }
    }
  }

  // localStorage
  if (location === 'local' || location === 'any') {
    const ls = getStorage();
    encryptedData = ls?.getItem(key) ?? null;
    if (encryptedData) {
      try {
        return await decrypt(encryptedData, secretKey);
      } catch {
        return null;
      }
    }
  }

  // cookies fallback for 'any' on client
  // Checked last so that localStorage/sessionStorage take precedence,
  // but cookies stored explicitly with location='cookie' are still found.
  if (location === 'any' && !isServer) {
    const cookieStorage = getCookieStorage();
    encryptedData = cookieStorage.getItem(key);
    if (encryptedData) {
      try {
        return await decrypt(encryptedData, secretKey);
      } catch {
        return null;
      }
    }
  }

  return null;
}
