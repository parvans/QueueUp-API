import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/**
 * DatabaseModule is decorated @Global so PrismaService is available
 * application-wide without each feature module importing DatabaseModule.
 *
 * Only one Prisma connection pool is created regardless of how many modules
 * reference PrismaService.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
