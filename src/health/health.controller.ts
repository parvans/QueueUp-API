import { Controller, Get, Res, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { PrismaService, DatabasePingResult } from '../prisma/prisma.service';

export interface HealthCheckResponse {
  status: 'ok' | 'degraded';
  uptime: number;
  timestamp: string;
  version: string;
  database: DatabasePingResult;
}

@SkipThrottle()
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prismaService: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Check API service and database health' })
  @ApiResponse({
    status: 200,
    description: 'Service is healthy and database is connected',
    schema: {
      example: {
        success: true,
        statusCode: 200,
        data: {
          status: 'ok',
          uptime: 12.34,
          timestamp: '2026-11-23T20:39:00.000Z',
          version: '1.0.0',
          database: {
            status: 'up',
            latencyMs: 3,
          },
        },
        timestamp: '2026-11-23T20:39:00.000Z',
      },
    },
  })
  @ApiResponse({
    status: 503,
    description: 'Service or database is degraded/unhealthy',
    schema: {
      example: {
        success: false,
        statusCode: 503,
        data: {
          status: 'degraded',
          uptime: 12.34,
          timestamp: '2026-11-23T20:39:00.000Z',
          version: '1.0.0',
          database: {
            status: 'down',
            latencyMs: 15,
            error: 'Database connectivity check failed',
          },
        },
        timestamp: '2026-11-23T20:39:00.000Z',
      },
    },
  })
  async check(
    @Res({ passthrough: true }) res: Response,
  ): Promise<HealthCheckResponse> {
    const dbResult = await this.prismaService.ping();
    const isHealthy = dbResult.status === 'up';

    if (!isHealthy) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return {
      status: isHealthy ? 'ok' : 'degraded',
      uptime: Math.round(process.uptime() * 100) / 100,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      database: dbResult,
    };
  }
}
