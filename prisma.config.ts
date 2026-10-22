/**
 * Prisma 6.x configuration file.
 *
 * This file is used by the Prisma CLI (prisma migrate, prisma generate, etc.).
 * It does NOT replace the datasource block in schema.prisma — both are needed:
 *   - schema.prisma: used by Prisma Client at runtime
 *   - prisma.config.ts: used by the CLI toolchain
 *
 * DATABASE_URL and DIRECT_URL are loaded from .env via dotenv.
 * Never hardcode credentials in this file.
 */
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
});
