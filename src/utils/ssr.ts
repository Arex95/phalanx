export const isServer = typeof window === 'undefined';
export const isClient = typeof window !== 'undefined';

export function getStorage(): Storage | null {
  if (isServer) return null;
  return window.localStorage;
}

export function getSessionStorage(): Storage | null {
  if (isServer) return null;
  return window.sessionStorage;
}

export interface CookieOptions {
  expires?: number;
  path?: string;
  domain?: string;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  httpOnly?: boolean;
}

export interface CookieStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string, options?: CookieOptions) => void;
  removeItem: (key: string, options?: { path?: string; domain?: string }) => void;
}

export function getCookieStorage(): CookieStorage {
  return {
    getItem: (key: string): string | null => {
      if (isServer) return null;
      const cookies = document.cookie.split(';');
      for (const cookie of cookies) {
        // Split on the FIRST '=' only — values may contain '=' (e.g. base64, hex).
        const separatorIndex = cookie.indexOf('=');
        if (separatorIndex === -1) continue;
        const name = cookie.substring(0, separatorIndex).trim();
        if (name !== key) continue;
        return decodeURIComponent(cookie.substring(separatorIndex + 1));
      }
      return null;
    },

    setItem: (key: string, value: string, options?: CookieOptions): void => {
      if (isServer) return;
      let cookie = `${key}=${encodeURIComponent(value)}`;

      if (options?.expires) {
        const date = new Date();
        date.setTime(date.getTime() + options.expires * 24 * 60 * 60 * 1000);
        cookie += `; expires=${date.toUTCString()}`;
      }

      cookie += `; path=${options?.path ?? '/'}`;

      if (options?.domain) {
        cookie += `; domain=${options.domain}`;
      }

      if (options?.secure !== false) {
        const isSecure =
          options?.secure ??
          (typeof window !== 'undefined' && window.location.protocol === 'https:');
        if (isSecure) cookie += '; Secure';
      }

      cookie += `; SameSite=${options?.sameSite ?? 'Lax'}`;

      if (options?.httpOnly) {
        throw new Error(
          '[phalanx] HttpOnly cookies cannot be set from JavaScript. ' +
          'Use server-side code (e.g. h3 setCookie) to set HttpOnly cookies.'
        );
      }

      document.cookie = cookie;
    },

    removeItem: (key: string, options?: { path?: string; domain?: string }): void => {
      if (isServer) return;
      const path = options?.path ?? '/';
      const domain = options?.domain ? `; domain=${options.domain}` : '';
      document.cookie = `${key}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path}${domain}`;
    },
  };
}

export interface PreferredStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

export function getPreferredStorage(): PreferredStorage {
  if (isServer) return getCookieStorage();
  return getStorage() ?? getCookieStorage();
}
