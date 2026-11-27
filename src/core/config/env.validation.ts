export interface EnvironmentVariables {
  DATABASE_URL: string;
  DIRECT_URL?: string;
  PORT: number;
  NODE_ENV: 'development' | 'production' | 'test';
  API_PREFIX: string;
  CORS_ORIGIN?: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  REFRESH_TOKEN_EXPIRES_IN: string;
  OTP_PEPPER: string;
  OTP_EXPIRY_MINUTES: number;
  OTP_MAX_ATTEMPTS: number;
  DEFAULT_COUNTRY_CODE: string;
  SMS_PROVIDER: string;
  DEV_TEST_PHONE?: string;
  DEV_TEST_OTP?: string;
  THROTTLE_TTL: number;
  THROTTLE_LIMIT: number;
  DB_POOL_MAX: number;
  DB_CONNECTION_TIMEOUT_MS: number;
}

/**
 * Validates and transforms raw environment variables into typed EnvironmentVariables.
 * Enforces strict cryptographic secret requirements (>= 32 chars) with no predictable fallbacks.
 * Sanitizes error messages to ensure database credentials and secrets are never leaked in logs.
 */
export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const errors: string[] = [];

  // 1. DATABASE_URL (Required)
  const databaseUrl = config.DATABASE_URL;
  if (!databaseUrl || typeof databaseUrl !== 'string') {
    errors.push('DATABASE_URL is required and must be a string');
  } else if (
    !databaseUrl.startsWith('postgresql://') &&
    !databaseUrl.startsWith('postgres://')
  ) {
    errors.push(
      'DATABASE_URL must be a valid PostgreSQL connection URI starting with postgresql:// or postgres://',
    );
  }

  // 2. PORT (Optional, default 3000)
  let port = 3000;
  if (config.PORT !== undefined && config.PORT !== '') {
    const parsedPort = Number(config.PORT);
    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      errors.push('PORT must be an integer between 1 and 65535');
    } else {
      port = parsedPort;
    }
  }

  // 3. NODE_ENV (Optional, default 'development')
  const nodeEnvRaw = (config.NODE_ENV as string) || 'development';
  const allowedEnvs = ['development', 'production', 'test'];
  if (!allowedEnvs.includes(nodeEnvRaw)) {
    errors.push(
      `NODE_ENV must be one of: ${allowedEnvs.join(', ')}. Received: ${nodeEnvRaw}`,
    );
  }
  const nodeEnv = nodeEnvRaw as 'development' | 'production' | 'test';

  // 4. API_PREFIX (Optional, default 'api/v1')
  const apiPrefix = (config.API_PREFIX as string) || 'api/v1';

  // 5. JWT_SECRET (Required, >= 32 characters)
  const jwtSecret = (config.JWT_SECRET as string) || '';
  if (!jwtSecret) {
    errors.push(
      'JWT_SECRET is required and must be at least 32 characters long (256-bit entropy)',
    );
  } else if (jwtSecret.length < 32) {
    errors.push(
      `JWT_SECRET is too short (${jwtSecret.length} chars). It must be at least 32 characters long for 256-bit cryptographic security`,
    );
  }

  // 6. OTP_PEPPER (Required, >= 32 characters)
  const otpPepper = (config.OTP_PEPPER as string) || '';
  if (!otpPepper) {
    errors.push(
      'OTP_PEPPER is required and must be at least 32 characters long (256-bit entropy)',
    );
  } else if (otpPepper.length < 32) {
    errors.push(
      `OTP_PEPPER is too short (${otpPepper.length} chars). It must be at least 32 characters long for 256-bit cryptographic security`,
    );
  }

  // 7. JWT_EXPIRES_IN (Optional, default '15m')
  const jwtExpiresIn = (config.JWT_EXPIRES_IN as string) || '15m';

  // 8. REFRESH_TOKEN_EXPIRES_IN (Optional, default '7d')
  const refreshTokenExpiresIn =
    (config.REFRESH_TOKEN_EXPIRES_IN as string) || '7d';

  // 9. OTP_EXPIRY_MINUTES (Optional, default 5)
  let otpExpiryMinutes = 5;
  if (
    config.OTP_EXPIRY_MINUTES !== undefined &&
    config.OTP_EXPIRY_MINUTES !== ''
  ) {
    const parsedMinutes = Number(config.OTP_EXPIRY_MINUTES);
    if (!Number.isInteger(parsedMinutes) || parsedMinutes <= 0) {
      errors.push('OTP_EXPIRY_MINUTES must be a positive integer');
    } else {
      otpExpiryMinutes = parsedMinutes;
    }
  }

  // 10. OTP_MAX_ATTEMPTS (Optional, default 3)
  let otpMaxAttempts = 3;
  if (config.OTP_MAX_ATTEMPTS !== undefined && config.OTP_MAX_ATTEMPTS !== '') {
    const parsedAttempts = Number(config.OTP_MAX_ATTEMPTS);
    if (!Number.isInteger(parsedAttempts) || parsedAttempts <= 0) {
      errors.push('OTP_MAX_ATTEMPTS must be a positive integer');
    } else {
      otpMaxAttempts = parsedAttempts;
    }
  }

  // 11. DEFAULT_COUNTRY_CODE (Optional, default 'IN')
  const defaultCountryCode =
    (config.DEFAULT_COUNTRY_CODE as string)?.toUpperCase() || 'IN';

  // 12. SMS_PROVIDER (Optional in dev/test: 'mock'; Required in prod: 'twilio' | 'aws_sns')
  const smsProvider = (config.SMS_PROVIDER as string) || 'mock';
  if (nodeEnv === 'production') {
    if (!smsProvider || smsProvider === 'mock') {
      errors.push(
        'SMS_PROVIDER must be configured with a valid provider (twilio, aws_sns) in production mode; mock provider is strictly prohibited',
      );
    }
  }

  // 13. DEV_TEST_PHONE & DEV_TEST_OTP (Strictly forbidden in production)
  const devTestPhone = config.DEV_TEST_PHONE as string | undefined;
  const devTestOtp = config.DEV_TEST_OTP as string | undefined;
  if (nodeEnv === 'production') {
    if (devTestPhone || devTestOtp) {
      errors.push(
        'DEV_TEST_PHONE and DEV_TEST_OTP cannot be configured in production mode',
      );
    }
  }

  // 14. THROTTLE_TTL (Optional, default 60000 ms)
  let throttleTtl = 60000;
  if (config.THROTTLE_TTL !== undefined && config.THROTTLE_TTL !== '') {
    const parsedTtl = Number(config.THROTTLE_TTL);
    if (Number.isNaN(parsedTtl) || parsedTtl <= 0) {
      errors.push('THROTTLE_TTL must be a positive number of milliseconds');
    } else {
      throttleTtl = parsedTtl;
    }
  }

  // 15. THROTTLE_LIMIT (Optional, default 100 requests)
  let throttleLimit = 100;
  if (config.THROTTLE_LIMIT !== undefined && config.THROTTLE_LIMIT !== '') {
    const parsedLimit = Number(config.THROTTLE_LIMIT);
    if (!Number.isInteger(parsedLimit) || parsedLimit <= 0) {
      errors.push('THROTTLE_LIMIT must be a positive integer');
    } else {
      throttleLimit = parsedLimit;
    }
  }

  // 16. DB_POOL_MAX (Optional, default 10)
  let dbPoolMax = 10;
  if (config.DB_POOL_MAX !== undefined && config.DB_POOL_MAX !== '') {
    const parsedPoolMax = Number(config.DB_POOL_MAX);
    if (!Number.isInteger(parsedPoolMax) || parsedPoolMax <= 0) {
      errors.push('DB_POOL_MAX must be a positive integer');
    } else {
      dbPoolMax = parsedPoolMax;
    }
  }

  // 17. DB_CONNECTION_TIMEOUT_MS (Optional, default 10000 ms)
  let dbTimeoutMs = 10000;
  if (
    config.DB_CONNECTION_TIMEOUT_MS !== undefined &&
    config.DB_CONNECTION_TIMEOUT_MS !== ''
  ) {
    const parsedTimeout = Number(config.DB_CONNECTION_TIMEOUT_MS);
    if (Number.isNaN(parsedTimeout) || parsedTimeout <= 0) {
      errors.push('DB_CONNECTION_TIMEOUT_MS must be a positive number');
    } else {
      dbTimeoutMs = parsedTimeout;
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Environment configuration validation failed:\n - ${errors.join('\n - ')}`,
    );
  }

  return {
    DATABASE_URL: databaseUrl as string,
    DIRECT_URL:
      typeof config.DIRECT_URL === 'string' ? config.DIRECT_URL : undefined,
    PORT: port,
    NODE_ENV: nodeEnv,
    API_PREFIX: apiPrefix,
    CORS_ORIGIN:
      typeof config.CORS_ORIGIN === 'string' ? config.CORS_ORIGIN : undefined,
    JWT_SECRET: jwtSecret,
    JWT_EXPIRES_IN: jwtExpiresIn,
    REFRESH_TOKEN_EXPIRES_IN: refreshTokenExpiresIn,
    OTP_PEPPER: otpPepper,
    OTP_EXPIRY_MINUTES: otpExpiryMinutes,
    OTP_MAX_ATTEMPTS: otpMaxAttempts,
    DEFAULT_COUNTRY_CODE: defaultCountryCode,
    SMS_PROVIDER: smsProvider,
    DEV_TEST_PHONE: devTestPhone,
    DEV_TEST_OTP: devTestOtp,
    THROTTLE_TTL: throttleTtl,
    THROTTLE_LIMIT: throttleLimit,
    DB_POOL_MAX: dbPoolMax,
    DB_CONNECTION_TIMEOUT_MS: dbTimeoutMs,
  };
}
