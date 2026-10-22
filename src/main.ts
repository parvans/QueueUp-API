import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import type { AppEnv } from './config/env.validation.js';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    // Structured JSON logs in production; pretty-print in dev.
    logger:
      process.env.NODE_ENV === 'production'
        ? ['error', 'warn', 'log']
        : ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const config = app.get(ConfigService<AppEnv, true>);

  // ── Global API prefix ────────────────────────────────────────────────────
  const apiPrefix = config.get('API_PREFIX', { infer: true });
  app.setGlobalPrefix(apiPrefix);

  // ── Global validation pipe ───────────────────────────────────────────────
  // whitelist: strips unknown properties from incoming DTOs.
  // forbidNonWhitelisted: rejects requests with unknown properties (400).
  // transform: auto-casts primitives (e.g. "3000" → 3000 for @Type(() => Number)).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ── CORS ─────────────────────────────────────────────────────────────────
  const rawOrigins = config.get('CORS_ORIGINS', { infer: true });
  const origins =
    rawOrigins === '*' ? '*' : rawOrigins.split(',').map((o) => o.trim());
  app.enableCors({ origin: origins, credentials: true });

  // ── Swagger / OpenAPI ────────────────────────────────────────────────────
  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('QueueUp API')
      .setDescription(
        'Virtual queue management platform — NestJS backend API.\n\n' +
          'All endpoints are prefixed with `/api/v1`.\n\n' +
          '**Authentication:** JWT Bearer token (Phase 2). ' +
          'Use the Authorize button to set your token.',
      )
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access-token',
      )
      .addTag('Health', 'Application health checks')
      .addTag('Auth', 'Authentication and session management')
      .addTag('Users', 'Patient profile and dependents')
      .addTag('Clinics', 'Clinic discovery and staff management')
      .addTag('Doctors', 'Doctor profiles and queue assignment')
      .addTag('Queues', 'Daily queue lifecycle management')
      .addTag('Tokens', 'Token booking and queue state transitions')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    // Served at /docs (outside the api/v1 prefix for convenience)
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
    logger.log('Swagger UI available at /docs');
  }

  // ── Start ────────────────────────────────────────────────────────────────
  const port = parseInt(config.get('PORT', { infer: true }), 10);
  await app.listen(port);
  logger.log(`Application running on http://localhost:${port}/${apiPrefix}`);
}

bootstrap().catch((err: unknown) => {
  // Use process.stderr to ensure the error is always visible even if the
  // NestJS logger has not yet been initialised.
  process.stderr.write(`Fatal startup error: ${String(err)}\n`);
  process.exit(1);
});
