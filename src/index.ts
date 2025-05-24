import Fastify from 'fastify';
import { config } from '@/config/environment';
import { logger } from '@/utils/logger';
import { registerPlugins } from '@/plugins';
import { registerRoutes } from '@/api/routes';
import { connectDatabase } from '@/database/connection';
import { connectRedis } from '@/services/redis';
import vappRoutes from '@/api/routes/vapps';
import webhookRoutes from '@/api/routes/webhooks';
import verificationRoutes from '@/api/routes/verification';

async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL || 'info',
    },
    trustProxy: true,
  });

  try {
    // Connect to external services
    await connectDatabase();
    await connectRedis();

    // Register plugins
    await registerPlugins(app);

    // Register API routes
    try {
      await app.register(vappRoutes, { prefix: '/api/v1' });
      await app.register(webhookRoutes, { prefix: '/api/v1' });
      await app.register(verificationRoutes, { prefix: '/api/v1' });
    } catch (error) {
      app.log.error('Failed to register routes:', error);
      throw error;
    }

    // Health check endpoint
    app.get('/health', async () => {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        environment: config.NODE_ENV,
      };
    });

    return app;
  } catch (error) {
    app.log.error('Failed to build application:', error);
    throw error;
  }
}

async function start() {
  try {
    const app = await buildApp();

    await app.listen({
      port: config.PORT,
      host: config.HOST,
    });

    app.log.info(`🚀 OpenvApps Hub API started on ${config.HOST}:${config.PORT}`);
    app.log.info(`📚 API Documentation: http://${config.HOST}:${config.PORT}/docs`);
    app.log.info(`🔍 Health Check: http://${config.HOST}:${config.PORT}/health`);

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Start the server
if (require.main === module) {
  start();
}

export { buildApp };
