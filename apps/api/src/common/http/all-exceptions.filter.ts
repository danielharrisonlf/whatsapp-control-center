import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { ApiErrorBody } from '@wacc/types';
import type { Request, Response } from 'express';
import { ZodSerializationException, ZodValidationException } from 'nestjs-zod';
import type { ZodError } from 'zod';
import { MetaApiError } from '../../modules/meta/meta-error';
import { AppException } from '../errors';
import { RequestContext } from '../request-context';

/** Every error leaves the API in the same `ApiErrorBody` shape. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const requestId = RequestContext.get()?.requestId;
    const body = this.toBody(exception, requestId);

    if (body.statusCode >= 500) {
      this.logger.error(
        `${req.method} ${req.path} → ${body.statusCode} ${body.code}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }
    if (!res.headersSent) res.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown, requestId?: string): ApiErrorBody {
    const base = (statusCode: number, code: string, message: string): ApiErrorBody => ({
      statusCode,
      error: HttpStatus[statusCode] ?? 'Error',
      code,
      message,
      requestId,
    });

    if (exception instanceof ZodValidationException) {
      const zodError = exception.getZodError() as ZodError;
      return {
        ...base(400, 'VALIDATION_FAILED', 'Some fields are invalid.'),
        issues: zodError.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      };
    }
    if (exception instanceof ZodSerializationException) {
      return base(500, 'INTERNAL_ERROR', 'The server produced an invalid response.');
    }
    if (exception instanceof MetaApiError) {
      const status = exception.responseStatus;
      return {
        ...base(status, 'META_ERROR', exception.info.userMessage ?? exception.info.message),
        meta: exception.info,
      };
    }
    if (exception instanceof AppException) {
      const status = exception.getStatus();
      return { ...base(status, exception.code, exception.message), ...exception.extra };
    }
    if (exception instanceof ThrottlerException) {
      return base(429, 'RATE_LIMITED', 'Too many requests. Wait a moment and try again.');
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const message =
        typeof response === 'string'
          ? response
          : Array.isArray((response as { message?: unknown }).message)
            ? (response as { message: string[] }).message.join('; ')
            : String((response as { message?: unknown }).message ?? exception.message);
      const code =
        status === 404
          ? 'NOT_FOUND'
          : status === 403
            ? 'FORBIDDEN'
            : status === 401
              ? 'UNAUTHENTICATED'
              : status === 400
                ? 'VALIDATION_FAILED'
                : 'INTERNAL_ERROR';
      return base(status, code, message);
    }
    return base(
      500,
      'INTERNAL_ERROR',
      'Something failed on our side. The error was logged with this request ID.',
    );
  }
}
