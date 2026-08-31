import { App } from "vue";
import { ArexVueCoreOptions } from "./types/ArexVueCoreOptions";
import {
  configEndpoints,
  configAxios,
  configTokenPaths,
  configRefreshTokenPaths,
  configCsrf,
  configEncryption,
  configCallbacks,
} from "./config";

/**
 * Vue plugin entry point for `@arex95/vue-core`.
 *
 * Initializes the global configuration singletons in a deterministic order:
 * endpoints → tokenPaths → refreshTokenPaths → csrf → encryption → axios →
 * callbacks. No `appKey`/`tokenKeys` step anymore — nothing about tokens is
 * stored client-side (see `services/accessToken.ts`).
 */
export const ArexVueCore = {
  install: (_app: App, options: ArexVueCoreOptions) => {
    if (!options) {
      throw new Error('[arex-core] No configuration options provided to ArexVueCore.install().');
    }

    configEndpoints({
      loginEndpoint: options.endpoints.login,
      refreshEndpoint: options.endpoints.refresh,
      logoutEndpoint: options.endpoints.logout,
    });
    configTokenPaths({
      accessTokenPath: options.tokenPaths.accessToken,
    });
    configRefreshTokenPaths({
      accessTokenPath: options.refreshTokenPaths.accessToken,
    });
    if (options.csrf) {
      configCsrf(options.csrf);
    }
    if (options.encryption) {
      configEncryption(options.encryption);
    }
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
export * from "./actions";
export * from "./composables";
export * from "./config";
export * from "./enums";
export * from "./types";
export * from "./utils";
export * from "./services";
export * from "./fetchers";
export * from "./errors";
export * from "./crypto";
