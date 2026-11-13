import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  StreamableFile,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request, Response } from 'express';
import { BYPASS_TRANSFORM_KEY } from '../decorators/bypass-transform.decorator';

export interface StandardApiResponse<T> {
  success: true;
  statusCode: number;
  data: T;
  timestamp: string;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  StandardApiResponse<T> | T
> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<StandardApiResponse<T> | T> {
    // 1. Never interfere with non-HTTP contexts (e.g. WebSockets, Microservices)
    if (context.getType() !== 'http') {
      return next.handle();
    }

    // 2. Check for @BypassTransform() metadata on handler or class
    const isBypassed = this.reflector.getAllAndOverride<boolean>(
      BYPASS_TRANSFORM_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isBypassed) {
      return next.handle();
    }

    const httpContext = context.switchToHttp();
    const req = httpContext.getRequest<Request>();
    const res = httpContext.getResponse<Response>();

    // 3. Never interfere with Swagger documentation endpoints
    const url = req?.url || '';
    if (url.startsWith('/api/docs') || url.includes('swagger')) {
      return next.handle();
    }

    return next.handle().pipe(
      map((data: T) => {
        // 4. Do not interfere with streams, raw buffers, or if headers already sent
        if (
          data instanceof StreamableFile ||
          Buffer.isBuffer(data) ||
          res?.headersSent
        ) {
          return data;
        }

        // 5. Avoid double-wrapping already formatted responses
        if (
          data &&
          typeof data === 'object' &&
          'success' in data &&
          'data' in data &&
          (data as Record<string, unknown>).success === true
        ) {
          return data;
        }

        const statusCode = res?.statusCode ?? 200;

        return {
          success: true,
          statusCode,
          data: data !== undefined ? data : null,
          timestamp: new Date().toISOString(),
        } as StandardApiResponse<T>;
      }),
    );
  }
}
