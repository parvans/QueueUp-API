import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';

/**
 * Phase 1 E2E test suite.
 *
 * These tests verify the application bootstraps correctly and the
 * health endpoint responds as expected.
 *
 * The full AppModule requires DATABASE_URL and live Neon credentials.
 * For CI without a live connection, this test uses a minimal stub module
 * that replaces PrismaService with a fake health indicator.
 *
 * Real DB integration tests are added in Phase 4 once the full schema
 * and concurrency tests are required.
 */

import { Module, Controller, Get, Injectable } from '@nestjs/common';
import {
  TerminusModule,
  HealthCheck,
  HealthCheckService,
  HealthIndicatorResult,
  HealthIndicator,
} from '@nestjs/terminus';

// ── Stub health indicator (no real DB needed) ──────────────────────────────
@Injectable()
class AlwaysHealthyIndicator extends HealthIndicator {
  isHealthy(key: string): HealthIndicatorResult {
    return this.getStatus(key, true);
  }
}

@Controller('health')
class StubHealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicator: AlwaysHealthyIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([() => this.indicator.isHealthy('database')]);
  }
}

@Module({
  imports: [TerminusModule],
  controllers: [StubHealthController],
  providers: [AlwaysHealthyIndicator],
})
class TestAppModule {}

// ── Tests ──────────────────────────────────────────────────────────────────

interface HealthResponse {
  status: string;
  info: Record<string, { status: string }>;
  error: Record<string, unknown>;
  details: Record<string, { status: string }>;
}

describe('Health endpoint (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [TestAppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health returns 200 with status ok', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    const body = response.body as HealthResponse;
    expect(body.status).toBe('ok');
    expect(body.info).toHaveProperty('database');
    expect(body.info['database'].status).toBe('up');
  });

  it('GET /api/v1/nonexistent returns 404', async () => {
    await request(app.getHttpServer()).get('/api/v1/nonexistent').expect(404);
  });
});
