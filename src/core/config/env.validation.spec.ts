import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  const validBaseConfig = {
    DATABASE_URL:
      'postgresql://user:pass@ep-sample-pooler.region.neon.tech/queueup-dev',
    PORT: '3000',
    NODE_ENV: 'development',
  };

  it('should validate and return typed configuration with default values', () => {
    const result = validateEnv(validBaseConfig);

    expect(result.DATABASE_URL).toBe(validBaseConfig.DATABASE_URL);
    expect(result.PORT).toBe(3000);
    expect(result.NODE_ENV).toBe('development');
    expect(result.API_PREFIX).toBe('api/v1');
    expect(result.JWT_SECRET).toBeDefined();
    expect(result.JWT_EXPIRES_IN).toBe('7d');
    expect(result.THROTTLE_TTL).toBe(60000);
    expect(result.THROTTLE_LIMIT).toBe(100);
    expect(result.DB_POOL_MAX).toBe(10);
    expect(result.DB_CONNECTION_TIMEOUT_MS).toBe(10000);
  });

  it('should accept postgres:// as a valid database URI prefix', () => {
    const config = {
      ...validBaseConfig,
      DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
    };
    const result = validateEnv(config);
    expect(result.DATABASE_URL).toBe('postgres://user:pass@localhost:5432/db');
  });

  it('should throw when DATABASE_URL is missing or empty', () => {
    expect(() => validateEnv({})).toThrow(
      'DATABASE_URL is required and must be a string',
    );
  });

  it('should throw when DATABASE_URL does not start with postgresql:// or postgres://', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: 'mysql://user:pass@localhost:3306/db',
      }),
    ).toThrow('DATABASE_URL must be a valid PostgreSQL connection URI');
  });

  it('should not expose database credentials in error messages', () => {
    try {
      validateEnv({
        DATABASE_URL: 'invalid-scheme://super-secret-password@host/db',
      });
      fail('Should have thrown an error');
    } catch (err: unknown) {
      const errorMsg = (err as Error).message;
      expect(errorMsg).not.toContain('super-secret-password');
      expect(errorMsg).toContain(
        'DATABASE_URL must be a valid PostgreSQL connection URI',
      );
    }
  });

  it('should throw when PORT is out of range or not an integer', () => {
    expect(() =>
      validateEnv({
        ...validBaseConfig,
        PORT: '70000',
      }),
    ).toThrow('PORT must be an integer between 1 and 65535');

    expect(() =>
      validateEnv({
        ...validBaseConfig,
        PORT: '-1',
      }),
    ).toThrow('PORT must be an integer between 1 and 65535');

    expect(() =>
      validateEnv({
        ...validBaseConfig,
        PORT: 'abc',
      }),
    ).toThrow('PORT must be an integer between 1 and 65535');
  });

  it('should throw when NODE_ENV is invalid', () => {
    expect(() =>
      validateEnv({
        ...validBaseConfig,
        NODE_ENV: 'staging',
      }),
    ).toThrow('NODE_ENV must be one of: development, production, test');
  });

  it('should require JWT_SECRET in production mode', () => {
    expect(() =>
      validateEnv({
        ...validBaseConfig,
        NODE_ENV: 'production',
        JWT_SECRET: '',
      }),
    ).toThrow('JWT_SECRET is strictly required in production environment');
  });

  it('should parse custom THROTTLE_TTL, THROTTLE_LIMIT, and DB_POOL_MAX as numbers', () => {
    const result = validateEnv({
      ...validBaseConfig,
      THROTTLE_TTL: '30000',
      THROTTLE_LIMIT: '50',
      DB_POOL_MAX: '5',
      DB_CONNECTION_TIMEOUT_MS: '5000',
    });

    expect(result.THROTTLE_TTL).toBe(30000);
    expect(result.THROTTLE_LIMIT).toBe(50);
    expect(result.DB_POOL_MAX).toBe(5);
    expect(result.DB_CONNECTION_TIMEOUT_MS).toBe(5000);
  });
});
