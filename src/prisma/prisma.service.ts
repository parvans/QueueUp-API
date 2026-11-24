import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  Optional,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool, PoolConfig } from 'pg';

export interface DatabasePingResult {
  status: 'up' | 'down';
  latencyMs: number;
  error?: string;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  public readonly pool: Pool;

  constructor(
    private readonly configService: ConfigService,
    @Optional() poolOverride?: Pool,
  ) {
    const databaseUrl =
      configService?.get<string>('DATABASE_URL') ||
      process.env.DATABASE_URL ||
      '';
    const maxPool =
      configService?.get<number>('DB_POOL_MAX') ??
      (process.env.DB_POOL_MAX ? Number(process.env.DB_POOL_MAX) : 10);
    const connectionTimeoutMillis =
      configService?.get<number>('DB_CONNECTION_TIMEOUT_MS') ??
      (process.env.DB_CONNECTION_TIMEOUT_MS
        ? Number(process.env.DB_CONNECTION_TIMEOUT_MS)
        : 10000);

    const poolConfig: PoolConfig = {
      connectionString: databaseUrl,
      max: maxPool,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis,
    };

    const pool = poolOverride || new Pool(poolConfig);
    const adapter = new PrismaPg(pool);

    const nodeEnv =
      configService?.get<string>('NODE_ENV') || process.env.NODE_ENV;
    const isDev = nodeEnv === 'development';

    super({
      adapter,
      log: isDev ? ['warn', 'error'] : ['error'],
    });

    this.pool = pool;
  }

  /**
   * Initializes connection to the database.
   * Connects via Prisma adapter and verifies pool readiness.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log(
        'PrismaService connected successfully via PgBouncer connection pool',
      );
    } catch (err: unknown) {
      this.logger.error(
        `Failed to connect to database: ${(err as Error).message}`,
        (err as Error).stack,
      );
      throw err;
    }
  }

  /**
   * Gracefully tears down database connections on application shutdown.
   * Drains the pg.Pool to release Neon PgBouncer client reservations.
   */
  async onModuleDestroy(): Promise<void> {
    try {
      await this.$disconnect();
      if (this.pool && typeof this.pool.end === 'function') {
        await this.pool.end();
      }
      this.logger.log('PrismaService disconnected and connection pool drained');
    } catch (err: unknown) {
      this.logger.error(
        `Error during PrismaService disconnect: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Health ping utility measuring database query response time.
   * Executes a lightweight parameterized 'SELECT 1' query.
   * Sanitizes the public error message to ensure credentials and hostnames are never leaked.
   */
  async ping(): Promise<DatabasePingResult> {
    const startTime = Date.now();
    try {
      await this.$queryRaw(Prisma.sql`SELECT 1 as ping`);
      const latencyMs = Date.now() - startTime;
      return {
        status: 'up',
        latencyMs,
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - startTime;
      const rawError = err instanceof Error ? err.message : String(err);
      this.logger.error(`Database health ping failed: ${rawError}`);

      return {
        status: 'down',
        latencyMs,
        error: 'Database connectivity check failed',
      };
    }
  }

  /**
   * Safely acquires a row-level lock on a DailyQueue record within an interactive transaction.
   * Uses $queryRaw with parameterized Prisma.sql to prevent SQL injection and returns the locked row.
   * Throws NotFoundException if the target DailyQueue record does not exist.
   */
  async lockDailyQueue(
    tx: Prisma.TransactionClient,
    queueId: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM "DailyQueue" WHERE id = ${queueId} FOR UPDATE`,
    );

    if (!rows || rows.length === 0) {
      throw new NotFoundException(
        `DailyQueue with ID "${queueId}" not found for locking`,
      );
    }
  }

  /**
   * Reusable transactional wrapper that locks the specified DailyQueue and runs the callback.
   * Enforces short, atomic transaction execution boundaries.
   */
  async withQueueLock<T>(
    queueId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { timeout?: number; maxWait?: number },
  ): Promise<T> {
    return this.$transaction(
      async (tx) => {
        await this.lockDailyQueue(tx, queueId);
        return fn(tx);
      },
      {
        maxWait: options?.maxWait ?? 5000,
        timeout: options?.timeout ?? 10000,
      },
    );
  }
}
