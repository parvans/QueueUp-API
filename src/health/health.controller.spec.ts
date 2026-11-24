jest.mock('@nestjs/swagger', () => ({
  ApiTags: () => () => {},
  ApiOperation: () => () => {},
  ApiResponse: () => () => {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Response } from 'express';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';

describe('HealthController', () => {
  let controller: HealthController;
  let mockPrismaService: {
    ping: jest.Mock;
  };
  let mockResponse: Partial<Response>;

  beforeEach(async () => {
    mockPrismaService = {
      ping: jest.fn().mockResolvedValue({ status: 'up', latencyMs: 5 }),
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
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

  it('should have @SkipThrottle metadata applied to class', () => {
    const reflector = new Reflector();
    const skipThrottle = reflector.get<boolean>(
      'THROTTLER:SKIPdefault',
      HealthController,
    );
    expect(skipThrottle).toBe(true);
  });

  describe('check (combined health)', () => {
    it('should return status "ok" and database ping metrics when database is up (HTTP 200)', async () => {
      mockPrismaService.ping.mockResolvedValueOnce({
        status: 'up',
        latencyMs: 3,
      });

      const result = await controller.check(mockResponse as Response);

      expect(result).toBeDefined();
      expect(result.status).toBe('ok');
      expect(mockResponse.status).not.toHaveBeenCalledWith(
        HttpStatus.SERVICE_UNAVAILABLE,
      );
      expect(typeof result.uptime).toBe('number');
      expect(result.uptime).toBeGreaterThanOrEqual(0);
      expect(result.version).toBe('1.0.0');
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
      expect(result.database).toEqual({
        status: 'up',
        latencyMs: 3,
      });
    });

    it('should set HTTP 503 and return status "degraded" when database is down', async () => {
      mockPrismaService.ping.mockResolvedValueOnce({
        status: 'down',
        latencyMs: 12,
        error: 'Database connectivity check failed',
      });

      const result = await controller.check(mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.SERVICE_UNAVAILABLE,
      );
      expect(result.status).toBe('degraded');
      expect(result.database).toEqual({
        status: 'down',
        latencyMs: 12,
        error: 'Database connectivity check failed',
      });
    });
  });

  describe('liveness', () => {
    it('should return status "ok" with uptime and not query database', () => {
      const result = controller.liveness();

      expect(result.status).toBe('ok');
      expect(typeof result.uptime).toBe('number');
      expect(result.uptime).toBeGreaterThanOrEqual(0);
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
      expect(mockPrismaService.ping).not.toHaveBeenCalled();
    });
  });

  describe('readiness', () => {
    it('should return status "ok" with HTTP 200 when database is ready', async () => {
      mockPrismaService.ping.mockResolvedValueOnce({
        status: 'up',
        latencyMs: 4,
      });

      const result = await controller.readiness(mockResponse as Response);

      expect(result.status).toBe('ok');
      expect(mockResponse.status).not.toHaveBeenCalledWith(
        HttpStatus.SERVICE_UNAVAILABLE,
      );
      expect(result.database.status).toBe('up');
    });

    it('should return status "degraded" and HTTP 503 when database is not ready', async () => {
      mockPrismaService.ping.mockResolvedValueOnce({
        status: 'down',
        latencyMs: 20,
        error: 'Database connectivity check failed',
      });

      const result = await controller.readiness(mockResponse as Response);

      expect(result.status).toBe('degraded');
      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.SERVICE_UNAVAILABLE,
      );
      expect(result.database.status).toBe('down');
    });
  });
});
