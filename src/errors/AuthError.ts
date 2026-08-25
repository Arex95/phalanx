import { BaseError } from './BaseError';

export class AuthError extends BaseError {
  readonly code = 'AUTH_ERROR';
  readonly statusCode = 401;

  constructor(
    message: string = 'Authentication failed',
    context?: Record<string, unknown>
  ) {
    super(message, context);
  }

  static unauthorized(message?: string): AuthError {
    return new AuthError(message || 'Unauthorized access');
  }

  static tokenExpired(): AuthError {
    return new AuthError('Token has expired');
  }

  static tokenInvalid(): AuthError {
    return new AuthError('Invalid token');
  }

  static tokenMissing(): AuthError {
    return new AuthError('Authentication token is missing');
  }
}
