// src/routes/ticket.routes.ts
import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth';
import * as TicketController from '../controllers/ticket.controller';

const router = Router();

// All ticket routes require auth
router.post('/join',requireAuth, TicketController.join);
router.get('/my',requireAuth, TicketController.getMyTickets);
router.get('/:queueId/:ticketId',requireAuth, TicketController.getTicket);
router.post('/:queueId/call-next',requireAuth, requireAdmin, TicketController.callNext);
router.patch('/:ticketId/cancel',requireAuth, TicketController.cancelTicket);

export default router;