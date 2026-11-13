import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

export interface StandardApiErrorResponse {
  success: false;
  statusCode: number;
  error: string;
  message: string | string[];
  timestamp: string;
  path: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    // Only handle HTTP requests; bypass WebSockets and other protocols
    if (host.getType() !== 'http') {
      return;
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // If headers were already sent, delegate to Express default handler
    if (response.headersSent) {
      return;
    }

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorName = 'InternalServerError';
    let message: string | string[] = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        errorName = exception.name;
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        const respObj = exceptionResponse as Record<string, unknown>;
        message = (respObj.message as string | string[]) || exception.message;
        errorName =
          (respObj.error as string) || exception.name || 'HttpException';
      }
    } else if (exception instanceof Error) {
      const errName = exception.constructor?.name || '';
      const isPrismaError =
        errName.includes('PrismaClientKnownRequestError') ||
        (exception as { code?: string }).code?.startsWith('P');

      if (isPrismaError) {
        const code = (exception as { code?: string }).code;
        if (code === 'P2002') {
          status = HttpStatus.CONFLICT;
          errorName = 'Conflict';
          message = 'A record with this unique identifier already exists.';
        } else if (code === 'P2025') {
          status = HttpStatus.NOT_FOUND;
          errorName = 'Not Found';
          message = 'The requested record was not found.';
        } else {
          status = HttpStatus.BAD_REQUEST;
          errorName = 'Bad Request';
          message = 'A database operation error occurred.';
        }
      } else {
        // Genuine unhandled 500 error
        this.logger.error(
          `Unhandled error on ${request?.method} ${request?.url}: ${exception.message}`,
          exception.stack,
        );
        message =
          process.env.NODE_ENV === 'production'
            ? 'An internal server error occurred'
            : exception.message;
      }
    }

    const errorResponse: StandardApiErrorResponse = {
      success: false,
      statusCode: status,
      error: errorName,
      message,
      timestamp: new Date().toISOString(),
      path: request?.url || '',
    };

    response.status(status).json(errorResponse);
  }
}
