import type { ToolFailureCode } from './types.js';

export class DomainError extends Error {
  readonly code: ToolFailureCode;
  readonly recoverable: boolean;
  readonly details?: Record<string, unknown>;
  readonly nextTools?: string[];

  constructor(
    code: ToolFailureCode,
    message: string,
    options: {
      recoverable?: boolean;
      details?: Record<string, unknown>;
      nextTools?: string[];
    } = {},
  ) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.recoverable = options.recoverable ?? true;
    this.details = options.details;
    this.nextTools = options.nextTools;
  }
}
