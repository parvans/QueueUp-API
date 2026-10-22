import { validateEnv } from './env.validation.js';

describe('validateEnv', () => {
  const base = {
    NODE_ENV: 'development',
    PORT: '3000',
    API_PREFIX: 'api/v1',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    DIRECT_URL: 'postgresql://user:pass@localhost:5432/db',
    JWT_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    JWT_EXPIRES_IN: '7d',
    JWT_REFRESH_EXPIRES_IN: '30d',
    OTP_PROVIDER: '',
    OTP_SENDER_ID: 'QueueUp',
    CORS_ORIGINS: '*',
  };

  it('passes with a valid configuration', () => {
    expect(() => validateEnv(base)).not.toThrow();
  });

  it('throws if DATABASE_URL is missing', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { DATABASE_URL: _url, ...rest } = base;
    expect(() => validateEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it('throws if DATABASE_URL is not a valid URL', () => {
    expect(() => validateEnv({ ...base, DATABASE_URL: 'not-a-url' })).toThrow();
  });

  it('throws if JWT_SECRET is shorter than 32 characters', () => {
    expect(() => validateEnv({ ...base, JWT_SECRET: 'short' })).toThrow(
      /JWT_SECRET/,
    );
  });

  it('throws if NODE_ENV is not a recognised value', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'staging' })).toThrow();
  });

  it('applies default PORT of 3000 when not set', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { PORT: _port, ...rest } = base;
    const result = validateEnv(rest);
    expect(result.PORT).toBe('3000');
  });

  it('throws in production when OTP_PROVIDER is set but OTP_API_KEY is missing', () => {
    expect(() =>
      validateEnv({ ...base, NODE_ENV: 'production', OTP_PROVIDER: 'twilio' }),
    ).toThrow(/OTP_API_KEY/);
  });

  it('does NOT throw in development when OTP_PROVIDER is set without OTP_API_KEY', () => {
    expect(() =>
      validateEnv({ ...base, NODE_ENV: 'development', OTP_PROVIDER: 'twilio' }),
    ).not.toThrow();
  });
});
