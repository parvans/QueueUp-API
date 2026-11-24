jest.mock('@nestjs/swagger', () => ({
  ApiTags: () => () => {},
  ApiOperation: () => () => {},
  ApiResponse: () => () => {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/core/filters/all-exceptions.filter';
import { TransformInterceptor } from '../src/core/interceptors/transform.interceptor';
import { LoggingInterceptor } from '../src/core/interceptors/logging.interceptor';

describe('HealthController (e2e)', () => {
  let app: INestApplication<App>;
  const mockPrisma = {
    ping: jest.fn().mockResolvedValue({ status: 'up', latencyMs: 2 }),
    onModuleInit: jest.fn().mockResolvedValue(undefined),
    onModuleDestroy: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .compile();

    app = moduleFixture.createNestApplication();
    const reflector = app.get(Reflector);

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(
      new LoggingInterceptor(),
      new TransformInterceptor(reflector),
    );
    app.setGlobalPrefix('api/v1');

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/v1/health (GET) - returns health status with database status in standard envelope (HTTP 200)', async () => {
    mockPrisma.ping.mockResolvedValueOnce({ status: 'up', latencyMs: 2 });

    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    const body = response.body as {
      success: boolean;
      statusCode: number;
      data: {
        status: string;
        uptime: number;
        version: string;
        timestamp: string;
        database: {
          status: string;
          latencyMs: number;
        };
      };
      timestamp: string;
    };

    expect(body.success).toBe(true);
    expect(body.statusCode).toBe(200);
    expect(body.data.status).toBe('ok');
    expect(body.data.version).toBe('1.0.0');
    expect(typeof body.data.uptime).toBe('number');
    expect(typeof body.data.timestamp).toBe('string');
    expect(body.data.database.status).toBe('up');
    expect(typeof body.data.database.latencyMs).toBe('number');
    expect(typeof body.timestamp).toBe('string');
  });

  it('/api/v1/health (GET) - returns degraded status and HTTP 503 when database is down', async () => {
    mockPrisma.ping.mockResolvedValueOnce({
      status: 'down',
      latencyMs: 15,
      error: 'Database connectivity check failed',
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(503);

    const body = response.body as {
      success: boolean;
      statusCode: number;
      data: {
        status: string;
        database: {
          status: string;
          error?: string;
        };
      };
    };

    expect(body.success).toBe(false);
    expect(body.statusCode).toBe(503);
    expect(body.data.status).toBe('degraded');
    expect(body.data.database.status).toBe('down');
    expect(body.data.database.error).toBe('Database connectivity check failed');
  });

  it('/api/v1/non-existent-route (GET) - returns 404 in standard error envelope', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/non-existent-route')
      .expect(404);

    const body = response.body as {
      success: boolean;
      statusCode: number;
      error: string;
      message: string;
      timestamp: string;
      path: string;
    };

    expect(body.success).toBe(false);
    expect(body.statusCode).toBe(404);
    expect(body.error).toBe('Not Found');
    expect(body.message).toBe('Cannot GET /api/v1/non-existent-route');
    expect(typeof body.timestamp).toBe('string');
    expect(body.path).toBe('/api/v1/non-existent-route');
  });
});
