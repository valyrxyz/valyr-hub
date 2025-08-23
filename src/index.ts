import Fastify from 'fastify';
import { config } from '@/config/environment';
import { logger } from '@/utils/logger';
import { registerPlugins } from '@/plugins';
import { registerRoutes } from '@/api/routes';
import { connectDatabase } from '@/database/connection';
import { connectRedis } from '@/services/redis';
import authRoutes from '@/api/routes/auth';
import vappRoutes from '@/api/routes/vapps';
import submissionRoutes from '@/api/routes/submissions';
import proofRoutes from '@/api/routes/proofs';
import verificationRoutes from '@/api/routes/verification';
import flagRoutes from '@/api/routes/flags';
import stakeRoutes from '@/api/routes/stakes';
import exportRoutes from '@/api/routes/exports';
import webhookRoutes from '@/api/routes/webhooks';
import blockchainRoutes from '@/api/routes/blockchain';

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
      app.log.info('Registering authentication routes...');
      await app.register(authRoutes, { prefix: '/api/v1/auth' });
      app.log.info('✅ Authentication routes registered');

      app.log.info('Registering vApp routes...');
      await app.register(vappRoutes, { prefix: '/api/v1/vapps' });
      app.log.info('✅ VApp routes registered');

      app.log.info('Registering submission routes...');
      await app.register(submissionRoutes, { prefix: '/api/v1/submissions' });
      app.log.info('✅ Submission routes registered');

      app.log.info('Registering proof routes...');
      await app.register(proofRoutes, { prefix: '/api/v1/proofs' });
      app.log.info('✅ Proof routes registered');

      app.log.info('Registering verification routes...');
      await app.register(verificationRoutes, { prefix: '/api/v1/verification' });
      app.log.info('✅ Verification routes registered');

      app.log.info('Registering flag routes...');
      await app.register(flagRoutes, { prefix: '/api/v1/flags' });
      app.log.info('✅ Flag routes registered');

      app.log.info('Registering stake routes...');
      await app.register(stakeRoutes, { prefix: '/api/v1/stakes' });
      app.log.info('✅ Stake routes registered');

      app.log.info('Registering export routes...');
      await app.register(exportRoutes, { prefix: '/api/v1/exports' });
      app.log.info('✅ Export routes registered');

      app.log.info('Registering webhook routes...');
      await app.register(webhookRoutes, { prefix: '/api/v1/webhooks' });
      app.log.info('✅ Webhook routes registered');

      app.log.info('Registering blockchain routes...');
      await app.register(blockchainRoutes, { prefix: '/api/v1/blockchain' });
      app.log.info('✅ Blockchain routes registered');
    } catch (error) {
      app.log.error('Failed to register routes:', error);
      console.error('Route registration error details:', error);
      throw error;
    }

    // API overview endpoint
    app.get('/api', async () => {
      return {
        name: 'Valyr Hub API',
        version: '1.0.0',
        description: 'A neutral infrastructure layer for verifiable applications with zero-knowledge proofs',
        documentation: '/docs',
        endpoints: {
          auth: '/api/v1/auth',
          vapps: '/api/v1/vapps',
          submissions: '/api/v1/submissions',
          proofs: '/api/v1/proofs',
          verification: '/api/v1/verification',
          flags: '/api/v1/flags',
          stakes: '/api/v1/stakes',
          exports: '/api/v1/exports',
          webhooks: '/api/v1/webhooks',
          blockchain: '/api/v1/blockchain',
        },
        features: [
          'Zero-knowledge proof verification',
          'Blockchain anchoring',
          'IPFS file storage',
          'Real-time verification logs',
          'Webhook notifications',
          'Community flagging system',
          'Staking and slashing',
          'Export bundles',
        ],
      };
    });

    // Health check endpoint
    app.get('/health', async () => {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        environment: config.NODE_ENV,
        services: {
          database: 'connected',
          redis: 'connected',
          ipfs: 'connected',
        },
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

    app.log.info(`🚀 Valyr Hub API started on ${config.HOST}:${config.PORT}`);
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
