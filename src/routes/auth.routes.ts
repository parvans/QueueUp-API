// src/routes/auth.routes.ts
import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import * as AuthController from '../controllers/auth.controller';

const router = Router();

const registerSchema = z.object({
  name:     z.string().min(2),
  email:    z.string().email(),
  password: z.string().min(8),
  phone:    z.string().optional(),
});

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

router.post('/register', validate(registerSchema), AuthController.register);
router.post('/login',    validate(loginSchema),    AuthController.login);
router.post('/refresh',  AuthController.refresh);

export default router;