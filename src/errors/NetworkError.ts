import { BaseError } from './BaseError';

interface AxiosErrorInput {
  message?: string;
  response?: { status?: number; data?: { message?: string } | Record<string, unknown> };
  config?: { url?: string; method?: string };
}

interface FetchErrorInput {
  message?: string;
  cause?: unknown;
}

export class NetworkError extends BaseError {
  readonly code = 'NETWORK_ERROR';
  readonly statusCode?: number;
  readonly originalError?: unknown;

  constructor(
    message: string = 'Network request failed',
    statusCode?: number,
    originalError?: unknown,
    context?: Record<string, unknown>
  ) {
    super(message, context);
    this.statusCode = statusCode;
    this.originalError = originalError;
  }

  static fromAxiosError(error: AxiosErrorInput): NetworkError {
    const statusCode = error.response?.status;
    const responseMessage = (error.response?.data as { message?: string } | undefined)?.message;
    const message = responseMessage || error.message || 'Network request failed';

    return new NetworkError(message, statusCode, error, {
      url: error.config?.url,
      method: error.config?.method,
      responseData: error.response?.data,
    });
  }

  static fromFetchError(error: FetchErrorInput): NetworkError {
    return new NetworkError(
      error.message || 'Network request failed',
      undefined,
      error,
      { cause: error.cause }
    );
  }
}
