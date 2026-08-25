import { BaseError } from './BaseError';

export class ServerError extends BaseError {
  readonly code = 'SERVER_ERROR';
  readonly statusCode: number;

  constructor(
    message: string = 'Server error occurred',
    statusCode: number = 500,
    context?: Record<string, unknown>
  ) {
    super(message, context);
    this.statusCode = statusCode;
  }

  static internal(message?: string): ServerError {
    return new ServerError(message || 'Internal server error', 500);
  }

  static badGateway(message?: string): ServerError {
    return new ServerError(message || 'Bad gateway', 502);
  }

  static serviceUnavailable(message?: string): ServerError {
    return new ServerError(message || 'Service unavailable', 503);
  }

  static gatewayTimeout(message?: string): ServerError {
    return new ServerError(message || 'Gateway timeout', 504);
  }
}
