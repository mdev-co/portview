import 'dotenv/config';

import { defineConfig } from 'prisma/config';

// Prisma 7 evaluates this config before its own env loader runs, so
// dotenv/config sets process.env.DATABASE_URL up front. The driver
// adapter (PrismaPg) is wired in PrismaService at runtime; migrate /
// studio use datasource.url here.

const getDatabaseUrl = (): string => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set; check apps/api/.env');
  }
  return url;
};

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: getDatabaseUrl(),
  },
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
});
