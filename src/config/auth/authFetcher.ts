import { Fetcher } from '@/types/Fetcher';

let defaultAuthFetcher: Fetcher | null = null;
let createDefaultFetcher: (() => Fetcher) | null = null;

/**
 * Configures a default fetcher for authentication operations.
 * If not configured, useAuth will use the default Axios fetcher.
 * 
 * @param fetcher - The fetcher function to use for auth operations
 * 
 * @example
 * ```typescript
 * import { configAuthFetcher, type Fetcher } from '@arex95/vue-core';
 * import { $fetch } from 'ofetch';
 *
 * const ofetchFetcher: Fetcher = (config) =>
 *     $fetch(config.url, { method: config.method, query: config.params, body: config.data, headers: config.headers });
 *
 * configAuthFetcher(ofetchFetcher);
 * ```
 */
export function configAuthFetcher(fetcher: Fetcher): void {
  defaultAuthFetcher = fetcher;
}

/**
 * Configures a factory function to create the default fetcher lazily.
 * This is used internally to avoid circular dependencies.
 * 
 * @param factory - Factory function that creates a fetcher
 */
export function setDefaultAuthFetcherFactory(factory: () => Fetcher): void {
  createDefaultFetcher = factory;
}

/**
 * Gets the default auth fetcher, creating one from Axios if not configured.
 * This allows lazy initialization to avoid circular dependencies.
 * 
 * @returns The fetcher function to use
 */
export function getDefaultAuthFetcher(): Fetcher {
  if (defaultAuthFetcher) {
    return defaultAuthFetcher;
  }
  if (createDefaultFetcher) {
    defaultAuthFetcher = createDefaultFetcher();
    return defaultAuthFetcher;
  }
  throw new Error('Auth fetcher not configured. Please configure Axios or set a custom auth fetcher.');
}

