import { PrismaClient } from '@prisma/client';
import { logger } from '@/utils/logger';

let prisma: PrismaClient;

export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log: [
        { level: 'query', emit: 'event' },
        { level: 'error', emit: 'stdout' },
        { level: 'info', emit: 'stdout' },
        { level: 'warn', emit: 'stdout' },
      ],
    });

    // Log database queries in development
    if (process.env.NODE_ENV === 'development') {
      // Note: Prisma query logging is disabled due to type issues
      // prisma.$on('query', (e) => { ... });
    }
  }

  return prisma;
}

export async function connectDatabase(): Promise<void> {
  try {
    const client = getPrismaClient();
    await client.$connect();
    logger.info('✅ Connected to PostgreSQL database');
  } catch (error) {
    logger.error('❌ Failed to connect to database:', error);
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  try {
    if (prisma) {
      await prisma.$disconnect();
      logger.info('✅ Disconnected from PostgreSQL database');
    }
  } catch (error) {
    logger.error('❌ Failed to disconnect from database:', error);
    throw error;
  }
}

export { prisma };
