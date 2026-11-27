import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

const directUrl = env('DIRECT_URL');
if (!directUrl) {
  throw new Error(
    'DIRECT_URL environment variable is strictly required for Prisma schema migrations.',
  );
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: directUrl,
  },
});
