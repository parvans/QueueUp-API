// src/middleware/validate.ts
// Zod validation middleware — validates req.body against a schema.
// If invalid, returns 400 with the exact field errors.

import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        fields: result.error.flatten().fieldErrors,
      });
    }
    req.body = result.data;   // replace body with parsed+coerced data
    next();
  };
}