// src/controllers/ticket.controller.ts
import { Response } from 'express';
import { AuthRequest } from '../types';
import * as TicketService from '../services/ticket.service';
import { getIO } from '../socket/queue.socket';

export async function join(req: AuthRequest, res: Response) {
  const ticket = await TicketService.joinQueue(req.user!.id, req.body.queueId);

  // Emit real-time event — all users watching this queue get updated
  getIO().to(`queue:${ticket.queueId}`).emit('queue:updated', {
    queueId: ticket.queueId,
    event: 'ticket_joined',
  });

  res.status(201).json(ticket);
}

export async function getMyTickets(req: AuthRequest, res: Response) {
  const tickets = await TicketService.getMyTickets(req.user!.id);
  res.json(tickets);
}

export async function getTicket(req: AuthRequest, res: Response) {
  const data = await TicketService.getQueueWithPosition(
    req.params.queueId,
    req.params.ticketId,
  );
  res.json(data);
}

export async function callNext(req: AuthRequest, res: Response) {
  const ticket = await TicketService.callNext(req.params.queueId);

  const io = getIO();
  // Broadcast to everyone in this queue room
  io.to(`queue:${ticket.queueId}`).emit('queue:updated', {
    queueId: ticket.queueId,
    event: 'next_called',
    nowServing: ticket.token,
  });
  // Notify the specific user who was called
  io.to(`user:${ticket.user.id}`).emit('ticket:called', {
    ticketId: ticket.id,
    token: ticket.token,
    message: "It's your turn! Please proceed.",
  });

  res.json(ticket);
}

export async function cancelTicket(req: AuthRequest, res: Response) {
  const ticket = await TicketService.cancelTicket(
    req.params.ticketId, req.user!.id
  );

  getIO().to(`queue:${ticket.queueId}`).emit('queue:updated', {
    queueId: ticket.queueId,
    event: 'ticket_cancelled',
  });

  res.json(ticket);
}