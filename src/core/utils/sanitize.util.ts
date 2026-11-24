/**
 * Sanitizes strings and error messages to prevent accidental exposure of
 * database credentials, connection URIs, tokens, and sensitive secrets.
 */
export function sanitizeString(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return (
    text
      // 1. Redact passwords in database connection URIs: postgresql://user:password@host:port/db
      .replace(
        /(postgres(?:ql)?:\/\/[^/:\s@]+:)(?:[^/\s]+)@(?=[^/@\s]+(?:\/|\?|\s|$))/gi,
        '$1*****@',
      )
      // 2. Redact generic URIs: ://user:password@host
      .replace(
        /(\/\/[^/:\s@]+:)(?:[^/\s]+)@(?=[^/@\s]+(?:\/|\?|\s|$))/g,
        '$1*****@',
      )
      // 3. Redact Bearer tokens: Bearer eyJhbGci...
      .replace(/(bearer\s+)[a-zA-Z0-9_\-.]+/gi, '$1*****')
      // 4. Redact key-value secrets: token=..., password=..., secret=...
      .replace(
        /(password|secret|token|api[_-]?key)["':\s=]+([^"',;\s]+)/gi,
        '$1=*****',
      )
  );
}

/**
 * Extracts and sanitizes an error message from an unknown error object.
 */
export function sanitizeError(err: unknown): string {
  if (err instanceof Error) {
    return sanitizeString(err.message);
  }
  return sanitizeString(String(err));
}
