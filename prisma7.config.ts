import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// 1. Check if a migration or database schema command is being executed
const isMigrationCommand = process.argv.some(
  (arg) => arg.includes('migrate') || arg.includes('db'),
);

const directUrl = process.env.DIRECT_URL;
const databaseUrl = process.env.DATABASE_URL;

// 2. Enforce strict DIRECT_URL requirement for schema migrations
if (isMigrationCommand && !directUrl) {
  throw new Error(
    'DIRECT_URL environment variable is strictly required for Prisma schema migrations. Do not use pooled connection for migrations.',
  );
}

// 3. For non-migration commands (e.g. prisma generate in CI), allow DATABASE_URL or dummy fallback
const connectionUrl =
  directUrl || databaseUrl || 'postgresql://dummy:dummy@localhost:5432/dummy';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: connectionUrl,
  },
});
