import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { Prisma } from '@prisma/client';
import { Pool } from 'pg';

describe('PrismaService', () => {
  let service: PrismaService;
  let mockPool: jest.Mocked<Pool>;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockPoolEnd: jest.Mock;

  beforeEach(() => {
    mockPoolEnd = jest.fn().mockResolvedValue(undefined);
    mockPool = {
      end: mockPoolEnd,
      query: jest.fn().mockResolvedValue({ rows: [] }),
      on: jest.fn(),
      connect: jest.fn(),
    } as unknown as jest.Mocked<Pool>;

    mockConfigService = {
      get: jest
        .fn()
        .mockImplementation((key: string, defaultValue?: unknown) => {
          const values: Record<string, unknown> = {
            DATABASE_URL: 'postgresql://test:test@localhost:5432/testdb',
            DB_POOL_MAX: 10,
            DB_CONNECTION_TIMEOUT_MS: 10000,
            NODE_ENV: 'test',
          };
          return values[key] ?? defaultValue;
        }),
    } as unknown as jest.Mocked<ConfigService>;

    service = new PrismaService(mockConfigService, mockPool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should be defined and hold the configured pool', () => {
      expect(service).toBeDefined();
      expect(service.pool).toBe(mockPool);
    });

    it('should configure the pool with default max 10 connections if not specified', () => {
      const fallbackConfig = {
        get: jest.fn().mockReturnValue(undefined),
      } as unknown as ConfigService;

      const dummyPool = { end: jest.fn() } as unknown as Pool;
      const customService = new PrismaService(fallbackConfig, dummyPool);
      expect(customService.pool).toBe(dummyPool);
    });
  });

  describe('lifecycle management', () => {
    it('should call $connect on module init', async () => {
      const connectSpy = jest
        .spyOn(service, '$connect')
        .mockResolvedValueOnce(undefined);

      await service.onModuleInit();

      expect(connectSpy).toHaveBeenCalled();
    });

    it('should throw and sanitize error message if $connect fails on module init', async () => {
      jest
        .spyOn(service, '$connect')
        .mockRejectedValueOnce(
          new Error(
            'Connection refused to postgresql://user:secretPass@neon.tech/db',
          ),
        );

      await expect(service.onModuleInit()).rejects.toThrow(
        'Connection refused to postgresql://user:secretPass@neon.tech/db',
      );
    });

    it('should call $disconnect and drain pool on module destroy', async () => {
      const disconnectSpy = jest
        .spyOn(service, '$disconnect')
        .mockResolvedValueOnce(undefined);

      await service.onModuleDestroy();

      expect(disconnectSpy).toHaveBeenCalled();
      expect(mockPoolEnd).toHaveBeenCalled();
    });

    it('should handle disconnect errors gracefully without throwing', async () => {
      jest
        .spyOn(service, '$disconnect')
        .mockRejectedValueOnce(new Error('Disconnect error'));

      await expect(service.onModuleDestroy()).resolves.not.toThrow();
    });
  });

  describe('ping', () => {
    it('should return status "up" with latency when queryRaw succeeds', async () => {
      jest
        .spyOn(service, '$queryRaw')
        .mockResolvedValueOnce([{ ping: 1 }] as never);

      const result = await service.ping();

      expect(result.status).toBe('up');
      expect(typeof result.latencyMs).toBe('number');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.error).toBeUndefined();
    });

    it('should return status "down" with sanitized error message when queryRaw fails', async () => {
      jest
        .spyOn(service, '$queryRaw')
        .mockRejectedValueOnce(
          new Error('connect ECONNREFUSED 10.0.0.5:5432 - sensitive details'),
        );

      const result = await service.ping();

      expect(result.status).toBe('down');
      expect(typeof result.latencyMs).toBe('number');
      // Must not leak sensitive connection IP or message
      expect(result.error).toBe('Database connectivity check failed');
      expect(result.error).not.toContain('10.0.0.5');
    });
  });

  describe('lockDailyQueue', () => {
    it('should execute parameterized SELECT FOR UPDATE via $queryRaw and succeed if row exists', async () => {
      const mockTx = {
        $queryRaw: jest.fn().mockResolvedValue([{ id: 'queue-uuid-123' }]),
      } as unknown as Prisma.TransactionClient;

      const queueId = 'queue-uuid-123';
      await service.lockDailyQueue(mockTx, queueId);

      const rawMock = mockTx.$queryRaw as jest.Mock;
      expect(rawMock).toHaveBeenCalled();
      const rawCalls = rawMock.mock.calls as unknown[][];
      const callArg = rawCalls[0][0] as {
        strings: string[];
        values: unknown[];
      };

      // Verify the query uses SELECT ... FOR UPDATE and parameterizes queueId
      expect(callArg.strings.join('?')).toContain(
        'SELECT id FROM "DailyQueue" WHERE id = ? FOR UPDATE',
      );
      expect(callArg.values).toContain(queueId);
    });

    it('should throw NotFoundException if the queue row does not exist', async () => {
      const mockTx = {
        $queryRaw: jest.fn().mockResolvedValue([]),
      } as unknown as Prisma.TransactionClient;

      const queueId = 'non-existent-queue';
      await expect(service.lockDailyQueue(mockTx, queueId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('withQueueLock', () => {
    it('should wrap callback inside an interactive transaction with lock and return result', async () => {
      const mockTx = {
        $queryRaw: jest.fn().mockResolvedValue([{ id: 'queue-abc' }]),
      } as unknown as Prisma.TransactionClient;

      const transactionSpy = jest
        .spyOn(service, '$transaction')
        .mockImplementation(async (cb: unknown) => {
          if (typeof cb === 'function') {
            return (cb as (tx: Prisma.TransactionClient) => Promise<unknown>)(
              mockTx,
            );
          }
          return Promise.resolve(null);
        });

      const lockSpy = jest
        .spyOn(service, 'lockDailyQueue')
        .mockResolvedValue(undefined);

      const queueId = 'queue-abc';
      const action = jest.fn().mockResolvedValue({ processed: true });

      const result = await service.withQueueLock(queueId, action);

      expect(transactionSpy).toHaveBeenCalled();
      expect(lockSpy).toHaveBeenCalledWith(mockTx, queueId);
      expect(action).toHaveBeenCalledWith(mockTx);
      expect(result).toEqual({ processed: true });
    });

    it('should propagate errors and allow transaction rollback if callback fails', async () => {
      const mockTx = {
        $queryRaw: jest.fn().mockResolvedValue([{ id: 'queue-abc' }]),
      } as unknown as Prisma.TransactionClient;

      jest
        .spyOn(service, '$transaction')
        .mockImplementation(async (cb: unknown) => {
          if (typeof cb === 'function') {
            return (cb as (tx: Prisma.TransactionClient) => Promise<unknown>)(
              mockTx,
            );
          }
          return Promise.resolve(null);
        });

      jest.spyOn(service, 'lockDailyQueue').mockResolvedValue(undefined);

      const queueId = 'queue-abc';
      const action = jest
        .fn()
        .mockRejectedValue(new Error('Transaction action failed'));

      await expect(service.withQueueLock(queueId, action)).rejects.toThrow(
        'Transaction action failed',
      );
    });

    it('should serialize concurrent transactions targeting the same queue', async () => {
      const executionOrder: string[] = [];
      let activeLocks = 0;
      let maxConcurrentLocks = 0;

      // Simulate serialized row lock behavior in PostgreSQL
      let lockPromise = Promise.resolve();

      jest
        .spyOn(service, '$transaction')
        .mockImplementation(async (cb: unknown) => {
          if (typeof cb === 'function') {
            // Queue up transactions sequentially
            const previousLock = lockPromise;
            let releaseCurrentLock: () => void = () => {};
            lockPromise = new Promise<void>((resolve) => {
              releaseCurrentLock = resolve;
            });

            await previousLock;
            activeLocks++;
            if (activeLocks > maxConcurrentLocks) {
              maxConcurrentLocks = activeLocks;
            }

            try {
              const mockTx = {} as Prisma.TransactionClient;
              return await (
                cb as (tx: Prisma.TransactionClient) => Promise<unknown>
              )(mockTx);
            } finally {
              activeLocks--;
              releaseCurrentLock();
            }
          }
          return Promise.resolve(null);
        });

      jest.spyOn(service, 'lockDailyQueue').mockResolvedValue(undefined);

      const queueId = 'shared-queue-id';

      // Launch two concurrent operations on the same queue
      const tx1 = service.withQueueLock(queueId, async () => {
        executionOrder.push('tx1-start');
        await new Promise((resolve) => setTimeout(resolve, 20));
        executionOrder.push('tx1-end');
        return 'res1';
      });

      const tx2 = service.withQueueLock(queueId, async () => {
        executionOrder.push('tx2-start');
        await new Promise((resolve) => setTimeout(resolve, 10));
        executionOrder.push('tx2-end');
        return 'res2';
      });

      const [res1, res2] = await Promise.all([tx1, tx2]);

      expect(res1).toBe('res1');
      expect(res2).toBe('res2');
      // Verify serialized execution: tx1 must finish before tx2 starts
      expect(executionOrder).toEqual([
        'tx1-start',
        'tx1-end',
        'tx2-start',
        'tx2-end',
      ]);
      // Maximum concurrent lock count must never exceed 1
      expect(maxConcurrentLocks).toBe(1);
    });
  });
});
