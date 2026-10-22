import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';

/**
 * Root application module.
 *
 * Phase 1 wires:
 *   - ConfigModule (env validation via Zod, global scope)
 *   - DatabaseModule (global PrismaService)
 *   - HealthModule  (GET /health)
 *
 * Future phases will import:
 *   AuthModule, UsersModule, ClinicsModule, DoctorsModule,
 *   QueuesModule, TokensModule, GatewayModule, NotificationsModule.
 */
@Module({
  imports: [
    // ── Configuration ─────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true, // available in every module via ConfigService
      cache: true, // cache parsed values for performance
      validate: validateEnv, // Zod validation — throws on startup if invalid
    }),

    // ── Database ──────────────────────────────────────────────────────────
    DatabaseModule,

    // ── Health ────────────────────────────────────────────────────────────
    HealthModule,
  ],
})
export class AppModule {}
