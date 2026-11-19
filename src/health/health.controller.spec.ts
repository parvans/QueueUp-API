jest.mock('@nestjs/swagger', () => ({
  ApiTags: () => () => {},
  ApiOperation: () => () => {},
  ApiResponse: () => () => {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';

describe('HealthController', () => {
  let controller: HealthController;
  let mockPrismaService: {
    ping: jest.Mock;
  };

  beforeEach(async () => {
    mockPrismaService = {
      ping: jest.fn().mockResolvedValue({ status: 'up', latencyMs: 5 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('check', () => {
    it('should return status "ok" and database ping metrics when database is up', async () => {
      mockPrismaService.ping.mockResolvedValueOnce({
        status: 'up',
        latencyMs: 3,
      });

      const result = await controller.check();

      expect(result).toBeDefined();
      expect(result.status).toBe('ok');
      expect(typeof result.uptime).toBe('number');
      expect(result.uptime).toBeGreaterThanOrEqual(0);
      expect(result.version).toBe('1.0.0');
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
      expect(result.database).toEqual({
        status: 'up',
        latencyMs: 3,
      });
    });

    it('should return status "degraded" with error details when database is down', async () => {
      mockPrismaService.ping.mockResolvedValueOnce({
        status: 'down',
        latencyMs: 12,
        error: 'Database connection failed',
      });

      const result = await controller.check();

      expect(result.status).toBe('degraded');
      expect(result.database).toEqual({
        status: 'down',
        latencyMs: 12,
        error: 'Database connection failed',
      });
    });
  });
});
