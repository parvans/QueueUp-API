// src/types/index.ts
import { Request } from 'express';

// Extends Express Request to include the decoded JWT user
export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}