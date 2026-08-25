import { BaseError } from './BaseError';

export interface ValidationIssue {
  field: string;
  message: string;
  value?: unknown;
}

export class ValidationError extends BaseError {
  readonly code = 'VALIDATION_ERROR';
  readonly statusCode = 422;
  readonly issues: ValidationIssue[];

  constructor(
    message: string = 'Validation failed',
    issues: ValidationIssue[] = [],
    context?: Record<string, unknown>
  ) {
    super(message, context);
    this.issues = issues;
  }

  static fromIssues(issues: ValidationIssue[]): ValidationError {
    return new ValidationError(
      `Validation failed: ${issues.length} issue(s)`,
      issues
    );
  }

  static fromField(field: string, message: string, value?: unknown): ValidationError {
    return new ValidationError(
      `Validation failed for field "${field}"`,
      [{ field, message, value }]
    );
  }
}
