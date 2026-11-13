import { ExecutionContext, CallHandler, StreamableFile } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of, lastValueFrom } from 'rxjs';
import {
  TransformInterceptor,
  StandardApiResponse,
} from './transform.interceptor';
import { BYPASS_TRANSFORM_KEY } from '../decorators/bypass-transform.decorator';

describe('TransformInterceptor', () => {
  let interceptor: TransformInterceptor<unknown>;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    interceptor = new TransformInterceptor(reflector);
  });

  const createMockContext = (options: {
    type?: string;
    url?: string;
    statusCode?: number;
    bypassed?: boolean;
    headersSent?: boolean;
  }): ExecutionContext => {
    const {
      type = 'http',
      url = '/api/v1/resource',
      statusCode = 200,
      headersSent = false,
    } = options;

    const mockRequest = { url };
    const mockResponse = { statusCode, headersSent };

    return {
      getType: () => type,
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
    } as unknown as ExecutionContext;
  };

  it('should wrap standard response into StandardApiResponse envelope', async () => {
    const mockContext = createMockContext({ statusCode: 200 });
    const mockHandler: CallHandler = {
      handle: () => of({ message: 'Hello' }),
    };

    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

    const result$ = interceptor.intercept(mockContext, mockHandler);
    const result = (await lastValueFrom(result$)) as StandardApiResponse<{
      message: string;
    }>;

    expect(result).toHaveProperty('success', true);
    expect(result).toHaveProperty('statusCode', 200);
    expect(result.data).toEqual({ message: 'Hello' });
    expect(result).toHaveProperty('timestamp');
  });

  it('should handle null/undefined data cleanly', async () => {
    const mockContext = createMockContext({ statusCode: 204 });
    const mockHandler: CallHandler = {
      handle: () => of(undefined),
    };

    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

    const result$ = interceptor.intercept(mockContext, mockHandler);
    const result = (await lastValueFrom(
      result$,
    )) as StandardApiResponse<unknown>;

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(204);
    expect(result.data).toBeNull();
  });

  it('should bypass non-HTTP contexts (e.g. WebSockets)', async () => {
    const mockContext = createMockContext({ type: 'ws' });
    const mockHandler: CallHandler = {
      handle: () => of({ event: 'queueStateUpdated' }),
    };

    const result$ = interceptor.intercept(mockContext, mockHandler);
    const result = await lastValueFrom(result$);

    expect(result).toEqual({ event: 'queueStateUpdated' });
  });

  it('should bypass when @BypassTransform decorator is present', async () => {
    const mockContext = createMockContext({});
    const mockHandler: CallHandler = {
      handle: () => of({ raw: true }),
    };

    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      return key === BYPASS_TRANSFORM_KEY;
    });

    const result$ = interceptor.intercept(mockContext, mockHandler);
    const result = await lastValueFrom(result$);

    expect(result).toEqual({ raw: true });
  });

  it('should bypass Swagger documentation routes', async () => {
    const mockContext = createMockContext({ url: '/api/docs/swagger-ui.css' });
    const mockHandler: CallHandler = {
      handle: () => of('body { color: red }'),
    };

    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

    const result$ = interceptor.intercept(mockContext, mockHandler);
    const result = await lastValueFrom(result$);

    expect(result).toBe('body { color: red }');
  });

  it('should not double-wrap already enveloped responses', async () => {
    const mockContext = createMockContext({});
    const preEnveloped = {
      success: true,
      statusCode: 200,
      data: { custom: true },
      timestamp: new Date().toISOString(),
    };
    const mockHandler: CallHandler = {
      handle: () => of(preEnveloped),
    };

    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

    const result$ = interceptor.intercept(mockContext, mockHandler);
    const result = await lastValueFrom(result$);

    expect(result).toEqual(preEnveloped);
  });

  it('should bypass StreamableFile and Buffer data', async () => {
    const mockContext = createMockContext({});
    const streamableFile = new StreamableFile(Buffer.from('binary-data'));
    const mockHandler: CallHandler = {
      handle: () => of(streamableFile),
    };

    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

    const result$ = interceptor.intercept(mockContext, mockHandler);
    const result = await lastValueFrom(result$);

    expect(result).toBe(streamableFile);
  });
});

