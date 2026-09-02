import { AuthTokenPaths } from "@/types";

interface TokenPathsConfig {
  accessTokenPath?: string;
}

let tokenPathsConfig: AuthTokenPaths = {
  accessTokenPath: "data.access_token",
};

let refreshResponsePathsConfig: AuthTokenPaths = {
  accessTokenPath: "data.access_token",
};

/**
 * Configures the dot-notation path for extracting the access token from the
 * initial login response. There is no `refreshTokenPath` anymore — the
 * refresh token is never present in a JSON body this library reads (see
 * `refreshTokens.ts`).
 */
export function configTokenPaths(config: TokenPathsConfig): void {
  tokenPathsConfig = Object.freeze({
    accessTokenPath: config.accessTokenPath || "data.access_token",
  });
}

/**
 * Same as `configTokenPaths`, for the token-refresh response.
 */
export function configRefreshResponsePaths(config: TokenPathsConfig): void {
  refreshResponsePathsConfig = Object.freeze({
    accessTokenPath: config.accessTokenPath || "data.access_token",
  });
}

export function getTokenPathsConfig(): TokenPathsConfig {
  return tokenPathsConfig;
}

export function getRefreshResponsePathsConfig(): TokenPathsConfig {
  return refreshResponsePathsConfig;
}
