import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

export interface HealthCheckResponse {
  status: 'ok';
  uptime: number;
  timestamp: string;
  version: string;
}

@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Check API service health and uptime' })
  @ApiResponse({
    status: 200,
    description: 'Service is healthy and accepting requests',
    schema: {
      example: {
        success: true,
        statusCode: 200,
        data: {
          status: 'ok',
          uptime: 12.34,
          timestamp: '2026-11-13T20:34:00.000Z',
          version: '1.0.0',
        },
        timestamp: '2026-11-13T20:34:00.000Z',
      },
    },
  })
  check(): HealthCheckResponse {
    return {
      status: 'ok',
      uptime: Math.round(process.uptime() * 100) / 100,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    };
  }
}

