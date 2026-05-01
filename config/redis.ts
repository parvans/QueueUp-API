// src/config/redis.ts
import Redis from 'ioredis';

export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

redis.on('connect', () => console.log('✅ Redis connected'));
redis.on('error', (err) => console.error('❌ Redis error:', err));

// ── Cache helpers ─────────────────────────────────────────────────

// Queue state key: "queue:{id}:state"
export const QUEUE_KEY   = (id: string) => `queue:${id}:state`;
export const COUNTER_KEY = (id: string) => `queue:${id}:counter`;  // token counter

export async function getQueueCache(queueId: string) {
  const data = await redis.get(QUEUE_KEY(queueId));
  return data ? JSON.parse(data) : null;
}

export async function setQueueCache(queueId: string, data: object) {
  // Cache for 60 seconds — balance between freshness and DB load
  await redis.setex(QUEUE_KEY(queueId), 60, JSON.stringify(data));
}

export async function invalidateQueueCache(queueId: string) {
  await redis.del(QUEUE_KEY(queueId));
}

// Token counter — atomic increment prevents duplicate ticket numbers
export async function nextTokenNumber(queueId: string): Promise<number> {
  return await redis.incr(COUNTER_KEY(queueId));
}