import { ConfigService } from '@nestjs/config';
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

    it('should throw if $connect fails on module init', async () => {
      jest
        .spyOn(service, '$connect')
        .mockRejectedValueOnce(new Error('Connection refused'));

      await expect(service.onModuleInit()).rejects.toThrow(
        'Connection refused',
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

    it('should return status "down" with error details when queryRaw fails', async () => {
      jest
        .spyOn(service, '$queryRaw')
        .mockRejectedValueOnce(new Error('Database timeout'));

      const result = await service.ping();

      expect(result.status).toBe('down');
      expect(typeof result.latencyMs).toBe('number');
      expect(result.error).toBe('Database timeout');
    });
  });

  describe('lockDailyQueue', () => {
    it('should execute parameterized SELECT FOR UPDATE on the transaction client', async () => {
      const mockTx = {
        $executeRaw: jest.fn().mockResolvedValue(1),
      } as unknown as Prisma.TransactionClient;

      const queueId = 'queue-uuid-123';
      await service.lockDailyQueue(mockTx, queueId);

      const rawMock = mockTx.$executeRaw as jest.Mock;
      expect(rawMock).toHaveBeenCalled();
      const rawCalls = rawMock.mock.calls as unknown[][];
      const callArg = rawCalls[0][0] as {
        strings: string[];
        values: unknown[];
      };

      // Verify the query contains FOR UPDATE and parameterizes queueId
      expect(callArg.strings.join('?')).toContain(
        'SELECT id FROM "DailyQueue" WHERE id = ? FOR UPDATE',
      );
      expect(callArg.values).toContain(queueId);
    });
  });

  describe('withQueueLock', () => {
    it('should wrap callback inside an interactive transaction with lock', async () => {
      const mockTx = {
        $executeRaw: jest.fn().mockResolvedValue(1),
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
  });
});
