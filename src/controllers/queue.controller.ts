// src/controllers/queue.controller.ts
import { Response } from 'express';
import { AuthRequest } from '../types';
import * as QueueService from '../services/queue.service';

export async function getAll(req: AuthRequest, res: Response) {
  const queues = await QueueService.getAllQueues();
  res.json(queues);
}

export async function getOne(req: AuthRequest, res: Response) {
  const queue = await QueueService.getQueueById(req.params.id);
  res.json(queue);
}

export async function create(req: AuthRequest, res: Response) {
  const queue = await QueueService.createQueue(req.user!.id, req.body);
  res.status(201).json(queue);
}

export async function updateStatus(req: AuthRequest, res: Response) {
  const queue = await QueueService.updateQueueStatus(req.params.id, req.body.status);
  res.json(queue);
}