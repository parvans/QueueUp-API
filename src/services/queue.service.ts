// src/services/queue.service.ts
import { prisma } from '../config/prisma';
import { getQueueCache, setQueueCache } from '../config/redis';
import { QueueStatus } from '@prisma/client';

export async function getAllQueues() {
  return prisma.queue.findMany({
    include: {
      _count: { select: { tickets: { where: { status: 'WAITING' } } } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getQueueById(id: string) {
  // Check Redis cache first
  const cached = await getQueueCache(id);
  if (cached) return cached;

  const queue = await prisma.queue.findUnique({
    where: { id },
    include: {
      _count: { select: { tickets: { where: { status: 'WAITING' } } } },
      tickets: {
        where: { status: 'WAITING' },
        orderBy: { createdAt: 'asc' },
        take: 1,   // just the next ticket
      },
    },
  });

  if (!queue) throw new Error('Queue not found');

  // Cache the result
  await setQueueCache(id, queue);
  return queue;
}

export async function createQueue(
  adminId: string,
  data: {
    name: string;
    organization: string;
    code: string;
    operatingHours?: string;
    avgServiceTime?: number;
  }
) {
  const existing = await prisma.queue.findUnique({ where: { code: data.code } });
  if (existing) throw new Error('Queue code already taken');

  return prisma.queue.create({
    data: { ...data, adminId },
  });
}

export async function updateQueueStatus(id: string, status: QueueStatus) {
  const queue = await prisma.queue.update({
    where: { id },
    data: { status },
  });
  return queue;
}