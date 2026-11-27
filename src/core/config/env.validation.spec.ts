import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  const validSecret32 = '0123456789abcdef0123456789abcdef'; // exactly 32 chars
  const validPepper32 = 'fedcba9876543210fedcba9876543210'; // exactly 32 chars

  const validBaseConfig = {
    DATABASE_URL:
      'postgresql://user:pass@ep-sample-pooler.region.neon.tech/queueup-dev',
    PORT: '3000',
    NODE_ENV: 'development',
    JWT_SECRET: validSecret32,
    OTP_PEPPER: validPepper32,
  };

  it('should validate and return typed configuration with default values', () => {
    const result = validateEnv(validBaseConfig);

    expect(result.DATABASE_URL).toBe(validBaseConfig.DATABASE_URL);
    expect(result.PORT).toBe(3000);
    expect(result.NODE_ENV).toBe('development');
    expect(result.API_PREFIX).toBe('api/v1');
    expect(result.JWT_SECRET).toBe(validSecret32);
    expect(result.JWT_EXPIRES_IN).toBe('15m');
    expect(result.REFRESH_TOKEN_EXPIRES_IN).toBe('7d');
    expect(result.OTP_PEPPER).toBe(validPepper32);
    expect(result.OTP_EXPIRY_MINUTES).toBe(5);
    expect(result.OTP_MAX_ATTEMPTS).toBe(3);
    expect(result.DEFAULT_COUNTRY_CODE).toBe('IN');
    expect(result.SMS_PROVIDER).toBe('mock');
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
    expect(() =>
      validateEnv({
        JWT_SECRET: validSecret32,
        OTP_PEPPER: validPepper32,
      }),
    ).toThrow('DATABASE_URL is required and must be a string');
  });

  it('should throw when DATABASE_URL does not start with postgresql:// or postgres://', () => {
    expect(() =>
      validateEnv({
        ...validBaseConfig,
        DATABASE_URL: 'mysql://user:pass@localhost:3306/db',
      }),
    ).toThrow('DATABASE_URL must be a valid PostgreSQL connection URI');
  });

  it('should not expose database credentials in error messages', () => {
    try {
      validateEnv({
        ...validBaseConfig,
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

  it('should throw when JWT_SECRET is missing or shorter than 32 characters', () => {
    expect(() =>
      validateEnv({
        ...validBaseConfig,
        JWT_SECRET: '',
      }),
    ).toThrow('JWT_SECRET is required and must be at least 32 characters long');

    expect(() =>
      validateEnv({
        ...validBaseConfig,
        JWT_SECRET: 'too-short-secret',
      }),
    ).toThrow('JWT_SECRET is too short (16 chars)');
  });

  it('should throw when OTP_PEPPER is missing or shorter than 32 characters', () => {
    expect(() =>
      validateEnv({
        ...validBaseConfig,
        OTP_PEPPER: '',
      }),
    ).toThrow('OTP_PEPPER is required and must be at least 32 characters long');

    expect(() =>
      validateEnv({
        ...validBaseConfig,
        OTP_PEPPER: 'short-pepper-1234',
      }),
    ).toThrow('OTP_PEPPER is too short (17 chars)');
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
  });

  it('should throw when NODE_ENV is invalid', () => {
    expect(() =>
      validateEnv({
        ...validBaseConfig,
        NODE_ENV: 'staging',
      }),
    ).toThrow('NODE_ENV must be one of: development, production, test');
  });

  it('should enforce production SMS provider and forbid dev test overrides in production', () => {
    // 1. Mock provider forbidden in production
    expect(() =>
      validateEnv({
        ...validBaseConfig,
        NODE_ENV: 'production',
        SMS_PROVIDER: 'mock',
      }),
    ).toThrow(
      'SMS_PROVIDER must be configured with a valid provider (twilio, aws_sns) in production mode',
    );

    // 2. DEV_TEST_PHONE forbidden in production
    expect(() =>
      validateEnv({
        ...validBaseConfig,
        NODE_ENV: 'production',
        SMS_PROVIDER: 'twilio',
        DEV_TEST_PHONE: '+919999999999',
      }),
    ).toThrow(
      'DEV_TEST_PHONE and DEV_TEST_OTP cannot be configured in production mode',
    );

    // 3. Valid production configuration passes
    const prodResult = validateEnv({
      ...validBaseConfig,
      NODE_ENV: 'production',
      SMS_PROVIDER: 'twilio',
    });
    expect(prodResult.SMS_PROVIDER).toBe('twilio');
  });

  it('should parse custom auth and pool configurations properly', () => {
    const result = validateEnv({
      ...validBaseConfig,
      JWT_EXPIRES_IN: '30m',
      REFRESH_TOKEN_EXPIRES_IN: '14d',
      OTP_EXPIRY_MINUTES: '10',
      OTP_MAX_ATTEMPTS: '5',
      DEFAULT_COUNTRY_CODE: 'gb',
      THROTTLE_TTL: '30000',
      THROTTLE_LIMIT: '50',
      DB_POOL_MAX: '5',
      DB_CONNECTION_TIMEOUT_MS: '5000',
    });

    expect(result.JWT_EXPIRES_IN).toBe('30m');
    expect(result.REFRESH_TOKEN_EXPIRES_IN).toBe('14d');
    expect(result.OTP_EXPIRY_MINUTES).toBe(10);
    expect(result.OTP_MAX_ATTEMPTS).toBe(5);
    expect(result.DEFAULT_COUNTRY_CODE).toBe('GB');
    expect(result.THROTTLE_TTL).toBe(30000);
    expect(result.THROTTLE_LIMIT).toBe(50);
    expect(result.DB_POOL_MAX).toBe(5);
    expect(result.DB_CONNECTION_TIMEOUT_MS).toBe(5000);
  });
});
