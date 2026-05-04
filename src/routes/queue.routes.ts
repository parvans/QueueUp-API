// src/routes/queue.routes.ts
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as QueueController from '../controllers/queue.controller';

const router = Router();

const createSchema = z.object({
  name:           z.string().min(3),
  organization:   z.string().min(3),
  code:           z.string().min(3).max(12).toUpperCase(),
  operatingHours: z.string().optional(),
  avgServiceTime: z.number().optional(),
});

// Public
router.get('/',    QueueController.getAll);
router.get('/:id', QueueController.getOne);

// Protected
router.post('/', requireAuth, requireAdmin, validate(createSchema), QueueController.create);
router.patch('/:id/status', requireAuth, requireAdmin, QueueController.updateStatus);

export default router;