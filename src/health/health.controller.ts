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

export interface LivenessResponse {
  status: 'ok';
  uptime: number;
  timestamp: string;
}

export interface ReadinessResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  database: DatabasePingResult;
}

@SkipThrottle()
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prismaService: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: 'Comprehensive health check for API service and database',
  })
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
          timestamp: '2026-11-24T13:30:00.000Z',
          version: '1.0.0',
          database: {
            status: 'up',
            latencyMs: 3,
          },
        },
        timestamp: '2026-11-24T13:30:00.000Z',
      },
    },
  })
  @ApiResponse({
    status: 503,
    description: 'Service or database is degraded/unhealthy',
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

  @Get('liveness')
  @ApiOperation({
    summary:
      'Liveness probe: verifies process is alive (does not restart on DB blips)',
  })
  @ApiResponse({
    status: 200,
    description: 'Application process is responsive',
    schema: {
      example: {
        success: true,
        statusCode: 200,
        data: {
          status: 'ok',
          uptime: 12.34,
          timestamp: '2026-11-24T13:30:00.000Z',
        },
        timestamp: '2026-11-24T13:30:00.000Z',
      },
    },
  })
  liveness(): LivenessResponse {
    return {
      status: 'ok',
      uptime: Math.round(process.uptime() * 100) / 100,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('readiness')
  @ApiOperation({
    summary:
      'Readiness probe: verifies service and database readiness for traffic',
  })
  @ApiResponse({
    status: 200,
    description: 'Service is ready to handle client traffic',
  })
  @ApiResponse({
    status: 503,
    description:
      'Database is unavailable; load balancer should cease traffic routing',
  })
  async readiness(
    @Res({ passthrough: true }) res: Response,
  ): Promise<ReadinessResponse> {
    const dbResult = await this.prismaService.ping();
    const isReady = dbResult.status === 'up';

    if (!isReady) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return {
      status: isReady ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      database: dbResult,
    };
  }
}
