import { HttpException, HttpStatus } from '@nestjs/common';
import type { MetaErrorInfo } from '@wacc/types';

/** Machine-readable error codes returned in `ApiErrorBody.code`. */
export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'META_ERROR'
  | 'META_UNREACHABLE'
  | 'META_NOT_CONFIGURED'
  | 'META_PERMISSION_MISSING'
  | 'MANUAL_ACTION_REQUIRED'
  | 'INTERNAL_ERROR';

export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: ErrorCode,
    message: string,
    readonly extra: { issues?: { path: string; message: string }[]; meta?: MetaErrorInfo } = {},
  ) {
    super({ message, code, ...extra }, status);
  }
}

export const notFound = (resource: string) =>
  new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', `${resource} not found.`);

export const forbidden = (message = 'You do not have permission to perform this action.') =>
  new AppException(HttpStatus.FORBIDDEN, 'FORBIDDEN', message);

export const conflict = (message: string) => new AppException(HttpStatus.CONFLICT, 'CONFLICT', message);

export const badRequest = (message: string, issues?: { path: string; message: string }[]) =>
  new AppException(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', message, { issues });

/** For operations Meta does not expose through the API. */
export const manualActionRequired = (message: string) =>
  new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'MANUAL_ACTION_REQUIRED', message);
