// src/services/ticket.service.ts
import { prisma } from '../config/prisma';
import { invalidateQueueCache, nextTokenNumber } from '../config/redis';

export async function joinQueue(userId: string, queueId: string) {
  // Check queue exists and is open
  const queue = await prisma.queue.findUnique({ where: { id: queueId } });
  if (!queue) throw new Error('Queue not found');
  if (queue.status === 'CLOSED' || queue.status === 'PAUSED') {
    throw new Error('Queue is not accepting new tickets');
  }

  // Check user doesn't already have an active ticket in this queue
  const existing = await prisma.ticket.findFirst({
    where: { userId, queueId, status: { in: ['WAITING', 'CALLED'] } },
  });
  if (existing) throw new Error('You already have an active ticket in this queue');

  // Get current queue length for position
  const waitingCount = await prisma.ticket.count({
    where: { queueId, status: 'WAITING' },
  });

  // Atomic token number from Redis (no duplicate tokens)
  const tokenNum = await nextTokenNumber(queueId);
  const token    = `A-${String(tokenNum).padStart(3, '0')}`;   // A-001, A-002...

  const ticket = await prisma.ticket.create({
    data: {
      token,
      queueId,
      userId,
      position: waitingCount + 1,
      status: 'WAITING',
    },
    include: { queue: true },
  });

  // Invalidate cache — queue state has changed
  await invalidateQueueCache(queueId);

  return ticket;
}

export async function getTicketById(ticketId: string) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { queue: true },
  });
  if (!ticket) throw new Error('Ticket not found');
  return ticket;
}

export async function getMyTickets(userId: string) {
  return prisma.ticket.findMany({
    where: { userId },
    include: { queue: { select: { name: true, organization: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function callNext(queueId: string) {
  // Get the next WAITING ticket (oldest first)
  const next = await prisma.ticket.findFirst({
    where: { queueId, status: 'WAITING' },
    orderBy: { createdAt: 'asc' },
  });
  if (!next) throw new Error('No more tickets in queue');

  const ticket = await prisma.ticket.update({
    where: { id: next.id },
    data: { status: 'CALLED', calledAt: new Date() },
    include: { user: { select: { id: true, name: true } } },
  });

  await invalidateQueueCache(queueId);
  return ticket;
}

export async function serveTicket(ticketId: string) {
  const ticket = await prisma.ticket.update({
    where: { id: ticketId },
    data: { status: 'SERVED', servedAt: new Date() },
  });
  await invalidateQueueCache(ticket.queueId);
  return ticket;
}

export async function cancelTicket(ticketId: string, userId: string) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new Error('Ticket not found');
  if (ticket.userId !== userId) throw new Error('Not your ticket');
  if (ticket.status !== 'WAITING') throw new Error('Cannot cancel — ticket is not waiting');

  const updated = await prisma.ticket.update({
    where: { id: ticketId },
    data: { status: 'CANCELLED', cancelledAt: new Date() },
  });

  await invalidateQueueCache(ticket.queueId);
  return updated;
}

export async function getQueueWithPosition(queueId: string, ticketId: string) {
  // Get everything the ticket screen needs in one query
  const [ticket, waitingTickets, nowServing] = await Promise.all([
    prisma.ticket.findUnique({ where: { id: ticketId } }),
    prisma.ticket.count({ where: { queueId, status: 'WAITING' } }),
    prisma.ticket.findFirst({
      where: { queueId, status: 'CALLED' },
      orderBy: { calledAt: 'desc' },
    }),
  ]);

  if (!ticket) throw new Error('Ticket not found');

  // Calculate position (tickets with WAITING status created before this one)
  const position = await prisma.ticket.count({
    where: {
      queueId,
      status: 'WAITING',
      createdAt: { lt: ticket.createdAt },
    },
  });

  const queue = await prisma.queue.findUnique({ where: { id: queueId } });

  return {
    ticket,
    position,
    nowServing: nowServing?.token ?? '—',
    estimatedWaitMinutes: position * (queue?.avgServiceTime ?? 5),
  };
}