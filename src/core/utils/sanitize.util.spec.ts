import { sanitizeString, sanitizeError } from './sanitize.util';

describe('sanitizeUtil', () => {
  describe('sanitizeString', () => {
    it('should redact passwords in PostgreSQL connection URIs', () => {
      const input =
        'Error connecting to postgresql://neondb_owner:secret_password_123@ep-sample-pooler.c-6.neon.tech/queueup-dev?sslmode=require';
      const result = sanitizeString(input);

      expect(result).not.toContain('secret_password_123');
      expect(result).toContain(
        'postgresql://neondb_owner:*****@ep-sample-pooler.c-6.neon.tech/queueup-dev?sslmode=require',
      );
    });

    it('should redact passwords in postgres:// connection URIs', () => {
      const input = 'postgres://app_user:super_secret@localhost:5432/db';
      const result = sanitizeString(input);

      expect(result).not.toContain('super_secret');
      expect(result).toBe('postgres://app_user:*****@localhost:5432/db');
    });

    it('should redact Bearer tokens', () => {
      const input =
        'Authorization failed for Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz';
      const result = sanitizeString(input);

      expect(result).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz');
      expect(result).toContain('Bearer *****');
    });

    it('should redact key-value credentials', () => {
      const input =
        'Database error: password="mySecretPassword", token=abcdef12345';
      const result = sanitizeString(input);

      expect(result).not.toContain('mySecretPassword');
      expect(result).not.toContain('abcdef12345');
    });

    it('should safely handle empty or non-string inputs', () => {
      expect(sanitizeString('')).toBe('');
      expect(sanitizeString(null as unknown as string)).toBe('');
      expect(sanitizeString(undefined as unknown as string)).toBe('');
    });
  });

  describe('sanitizeError', () => {
    it('should sanitize Error instance messages', () => {
      const err = new Error(
        'Failed to connect to postgresql://admin:p@ssw0rd@10.0.0.1:5432/db',
      );
      const result = sanitizeError(err);

      expect(result).not.toContain('p@ssw0rd');
      expect(result).toContain('postgresql://admin:*****@10.0.0.1:5432/db');
    });

    it('should sanitize non-Error throwables', () => {
      const result = sanitizeError(
        'Connection dropped on postgresql://root:pass@remote:5432',
      );
      expect(result).not.toContain('pass@');
      expect(result).toContain('postgresql://root:*****@remote:5432');
    });
  });
});
