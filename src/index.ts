import { App } from "vue";
import { ArexVueCoreOptions } from "./types/ArexVueCoreOptions";
import {
  configEndpoints,
  configTokenKeys,
  configAxios,
  configAppKey,
  configTokenPaths,
  configRefreshTokenPaths,
  configRefreshTokenBodyKey,
  configCallbacks,
} from "./config";

/**
 * Vue plugin entry point for `@arex95/vue-core`.
 *
 * Initializes the global configuration singletons in a deterministic order:
 * appKey → tokenKeys → endpoints → tokenPaths → refreshTokenPaths →
 * refreshTokenBodyKey → axios → callbacks.
 */
export const ArexVueCore = {
  install: (_app: App, options: ArexVueCoreOptions) => {
    if (!options) {
      throw new Error('[arex-core] No configuration options provided to ArexVueCore.install().');
    }

    configAppKey({ appKey: options.appKey });
    configTokenKeys({
      accessTokenKey: options.tokenKeys.accessToken,
      refreshTokenKey: options.tokenKeys.refreshToken,
    });
    configEndpoints({
      loginEndpoint: options.endpoints.login,
      refreshEndpoint: options.endpoints.refresh,
      logoutEndpoint: options.endpoints.logout,
    });
    configTokenPaths({
      accessTokenPath: options.tokenPaths.accessToken,
      refreshTokenPath: options.tokenPaths.refreshToken,
    });
    configRefreshTokenPaths({
      accessTokenPath: options.refreshTokenPaths.accessToken,
      refreshTokenPath: options.refreshTokenPaths.refreshToken,
    });
    configRefreshTokenBodyKey(options.refreshTokenBodyKey);
    configAxios({
      baseURL: options.axios.baseURL,
      headers: options.axios.headers,
      timeout: options.axios.timeout,
      withCredentials: options.axios.withCredentials,
      setupAuthInterceptors: options.axios.setupAuthInterceptors,
    });
    configCallbacks({
      onRefreshFailed: options.onRefreshFailed,
      onLogout: options.onLogout,
    });
  },
};

// Public API surface — REST + Auth foundation only.
export * from "./rest";
export * from "./composables";
export * from "./config";
export * from "./enums";
export * from "./types";
export * from "./utils";
export * from "./services";
export * from "./fetchers";
export * from "./errors";
