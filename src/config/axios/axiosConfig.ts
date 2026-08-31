import axios, {
  AxiosResponse,
  AxiosError,
  AxiosInstance,
  CancelTokenSource,
  InternalAxiosRequestConfig,
} from 'axios';

import { AxiosServiceOptions } from '@/types/AxiosServiceOptions';
import { getAccessToken } from '@/services/accessToken';
import { getCsrfConfig } from '@config/global/csrfConfig';
import { getCookieStorage } from '@utils/ssr';
import { getEndpointsConfig } from '@config/global/endpointsConfig';
import { refreshTokens } from '@/services';
import { createAxiosFetcher } from '@/fetchers/axios';

declare module 'axios' {
  interface InternalAxiosRequestConfig {
    _retry?: boolean;
  }
}


export class AxiosService {
  private readonly instance: AxiosInstance;
  private cancelTokenSource: CancelTokenSource;
  private activeRequests: number = 0;
  private readonly refreshTokenUrl: string;
  private readonly logoutUrl: string;

  private isRefreshing = false;
  private failedQueue: {
    resolve: (value: string) => void;
    reject: (reason: AxiosError | Error) => void;
  }[] = [];

  constructor(options: AxiosServiceOptions) {
    this.cancelTokenSource = axios.CancelToken.source();

    const endpointsConfig = getEndpointsConfig();
    this.refreshTokenUrl = endpointsConfig.REFRESH;
    this.logoutUrl = endpointsConfig.LOGOUT;

    this.instance = axios.create({
      baseURL: options.baseURL ?? '',
      timeout: options.timeout ?? 30000,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...options.headers,
      },
      // Must be true for the backend's HttpOnly refresh cookie to be sent —
      // see PhalanxOptions' doc comment.
      withCredentials: options.withCredentials ?? false,
    });

    if (options.setupAuthInterceptors !== false) {
      this.initializeInterceptors();
    }
  }

  /**
   * Resolves or rejects all queued promises waiting for a token refresh.
   *
   * Fix: if both error and token are null (edge case), the queue is still
   * cleared to avoid permanently hanging promises.
   */
  private processQueue(error: AxiosError | Error | null, token: string | null = null): void {
    this.failedQueue.forEach((prom) => {
      if (error) {
        prom.reject(error);
      } else if (token) {
        prom.resolve(token);
      } else {
        // Neither error nor token — reject with a clear message rather than hanging
        prom.reject(new Error('[phalanx] Token refresh completed but no token was produced.'));
      }
    });
    this.failedQueue = [];
  }

  private setAuthHeader(config: InternalAxiosRequestConfig, token: string): void {
    if (config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }

  /** Reads the (JS-readable, non-`HttpOnly`) CSRF cookie and echoes it as a
   * header — only on the two requests that ride the `HttpOnly` auth cookie
   * (see `csrfConfig.ts`); every other request has nothing to protect here. */
  private setCsrfHeader(config: InternalAxiosRequestConfig): void {
    const csrf = getCsrfConfig();
    if (!csrf || !config.headers) return;
    if (config.url !== this.refreshTokenUrl && config.url !== this.logoutUrl) return;
    const value = getCookieStorage().getItem(csrf.cookieName);
    if (value) {
      config.headers[csrf.headerName] = value;
    }
  }

  private initializeInterceptors() {
    // Request: attach the in-memory access token + CSRF header
    this.instance.interceptors.request.use(
      (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
        const token = getAccessToken();
        if (token) {
          this.setAuthHeader(config, token);
        }
        this.setCsrfHeader(config);
        config.cancelToken = this.cancelTokenSource.token;
        this.activeRequests++;
        return config;
      },
      (error: AxiosError) => Promise.reject(error)
    );

    // Response: handle 401 with token refresh
    this.instance.interceptors.response.use(
      (response: AxiosResponse) => {
        this.activeRequests--;
        return response;
      },
      async (error: AxiosError) => {
        this.activeRequests--;

        // Do not attempt refresh in SSR — there is no cookie jar to send.
        if (typeof window === 'undefined') {
          return Promise.reject(error);
        }

        const originalRequest = error.config;
        const isAuthError  = axios.isAxiosError(error) && error.response?.status === 401;
        const isRefreshCall = originalRequest?.url === this.refreshTokenUrl;
        const isRetry       = originalRequest?._retry === true;

        if (!isAuthError || isRefreshCall || isRetry || !originalRequest) {
          return Promise.reject(error);
        }

        // Queue concurrent requests while a refresh is already in progress
        if (this.isRefreshing) {
          return new Promise<string>((resolve, reject) => {
            this.failedQueue.push({ resolve, reject });
          })
            .then((newToken) => {
              this.setAuthHeader(originalRequest, newToken);
              return this.instance(originalRequest);
            })
            .catch((err) => Promise.reject(err));
        }

        this.isRefreshing = true;
        originalRequest._retry = true;

        try {
          const fetcher = createAxiosFetcher(this.instance);
          await refreshTokens(fetcher);

          const newToken = getAccessToken();

          if (!newToken) {
            const refreshError = new Error('[phalanx] New token not found after refresh.');
            this.processQueue(refreshError, null);
            throw refreshError;
          }

          this.processQueue(null, newToken);
          this.setAuthHeader(originalRequest, newToken);
          this.isRefreshing = false;
          return this.instance(originalRequest);
        } catch (refreshError) {
          this.processQueue(refreshError as AxiosError, null);
          this.isRefreshing = false;
          return Promise.reject(error);
        }
      }
    );
  }

  public getActiveRequests(): number {
    return this.activeRequests;
  }

  public getAxiosInstance(): AxiosInstance {
    return this.instance;
  }

  public cancelAllRequests() {
    this.cancelTokenSource.cancel('Operation canceled by the user.');
    this.cancelTokenSource = axios.CancelToken.source();
  }

  public setHeader(key: string, value: string) {
    this.instance.defaults.headers.common[key] = value;
  }

  public removeHeader(key: string) {
    delete this.instance.defaults.headers.common[key];
  }
}
