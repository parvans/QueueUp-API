import { z } from 'zod';

/**
 * Zod schema that validates all required environment variables at startup.
 * The application will throw and exit if any required variable is missing or
 * has an unexpected type / format.
 *
 * Add new variables here as new modules are introduced (e.g. JWT in Phase 2).
 */
const envSchema = z.object({
  // ── Application ────────────────────────────────────────────────────────
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z
    .string()
    .regex(/^\d+$/, 'PORT must be a numeric string')
    .default('3000'),
  API_PREFIX: z.string().default('api/v1'),

  // ── Database ───────────────────────────────────────────────────────────
  DATABASE_URL: z
    .string()
    .url('DATABASE_URL must be a valid PostgreSQL connection string'),
  DIRECT_URL: z
    .string()
    .url('DIRECT_URL must be a valid PostgreSQL connection string'),

  // ── JWT (validated here; actual logic lives in AuthModule — Phase 2) ──
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  // ── OTP (D-04: provider deferred; only key is validated if provider set) ─
  OTP_PROVIDER: z.enum(['twilio', 'msg91', 'fast2sms', 'sns', '']).default(''),
  OTP_API_KEY: z.string().optional(),
  OTP_SENDER_ID: z.string().default('QueueUp'),

  // ── FCM ────────────────────────────────────────────────────────────────
  FCM_SERVER_KEY: z.string().optional(),
  FCM_PROJECT_ID: z.string().optional(),

  // ── CORS ───────────────────────────────────────────────────────────────
  CORS_ORIGINS: z.string().default('*'),
});

export type AppEnv = z.infer<typeof envSchema>;

/**
 * Validates process.env against envSchema.
 * Called by ConfigModule.forRoot({ validate }) so the app fails fast
 * with a descriptive error rather than crashing later at a usage site.
 */
export function validateEnv(config: Record<string, unknown>): AppEnv {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const formatted = result.error.errors
      .map((e) => `  [${e.path.join('.')}] ${e.message}`)
      .join('\n');
    throw new Error(
      `Environment validation failed. Fix the following:\n${formatted}`,
    );
  }

  // Production safety: OTP_API_KEY must be set when a provider is configured.
  if (
    result.data.OTP_PROVIDER !== '' &&
    result.data.NODE_ENV === 'production' &&
    !result.data.OTP_API_KEY
  ) {
    throw new Error(
      'OTP_API_KEY is required in production when OTP_PROVIDER is set.',
    );
  }

  return result.data;
}
