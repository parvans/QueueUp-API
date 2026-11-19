export interface EnvironmentVariables {
  DATABASE_URL: string;
  DIRECT_URL?: string;
  PORT: number;
  NODE_ENV: 'development' | 'production' | 'test';
  API_PREFIX: string;
  CORS_ORIGIN?: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  THROTTLE_TTL: number;
  THROTTLE_LIMIT: number;
  DB_POOL_MAX: number;
  DB_CONNECTION_TIMEOUT_MS: number;
}

/**
 * Validates and transforms raw environment variables into typed EnvironmentVariables.
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

  // 5. JWT_SECRET
  let jwtSecret = (config.JWT_SECRET as string) || '';
  if (!jwtSecret) {
    if (nodeEnv === 'production') {
      errors.push('JWT_SECRET is strictly required in production environment');
    } else {
      jwtSecret = 'dev-insecure-secret-key-change-in-production';
    }
  }

  // 6. JWT_EXPIRES_IN (Optional, default '7d')
  const jwtExpiresIn = (config.JWT_EXPIRES_IN as string) || '7d';

  // 7. THROTTLE_TTL (Optional, default 60000 ms)
  let throttleTtl = 60000;
  if (config.THROTTLE_TTL !== undefined && config.THROTTLE_TTL !== '') {
    const parsedTtl = Number(config.THROTTLE_TTL);
    if (Number.isNaN(parsedTtl) || parsedTtl <= 0) {
      errors.push('THROTTLE_TTL must be a positive number of milliseconds');
    } else {
      throttleTtl = parsedTtl;
    }
  }

  // 8. THROTTLE_LIMIT (Optional, default 100 requests)
  let throttleLimit = 100;
  if (config.THROTTLE_LIMIT !== undefined && config.THROTTLE_LIMIT !== '') {
    const parsedLimit = Number(config.THROTTLE_LIMIT);
    if (!Number.isInteger(parsedLimit) || parsedLimit <= 0) {
      errors.push('THROTTLE_LIMIT must be a positive integer');
    } else {
      throttleLimit = parsedLimit;
    }
  }

  // 9. DB_POOL_MAX (Optional, default 10)
  let dbPoolMax = 10;
  if (config.DB_POOL_MAX !== undefined && config.DB_POOL_MAX !== '') {
    const parsedPoolMax = Number(config.DB_POOL_MAX);
    if (!Number.isInteger(parsedPoolMax) || parsedPoolMax <= 0) {
      errors.push('DB_POOL_MAX must be a positive integer');
    } else {
      dbPoolMax = parsedPoolMax;
    }
  }

  // 10. DB_CONNECTION_TIMEOUT_MS (Optional, default 10000 ms)
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
    THROTTLE_TTL: throttleTtl,
    THROTTLE_LIMIT: throttleLimit,
    DB_POOL_MAX: dbPoolMax,
    DB_CONNECTION_TIMEOUT_MS: dbTimeoutMs,
  };
}
