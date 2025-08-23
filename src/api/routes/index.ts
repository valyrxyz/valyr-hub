import { FastifyInstance } from 'fastify';
import authRoutes from './auth';
import vappRoutes from './vapps';
import submissionRoutes from './submissions';
import proofRoutes from './proofs';
import verificationRoutes from './verification';
import flagRoutes from './flags';
import stakeRoutes from './stakes';
import exportRoutes from './exports';
import webhookRoutes from './webhooks';
import blockchainRoutes from './blockchain';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // API version prefix
  await app.register(async function (app) {
    // Authentication routes
    await app.register(authRoutes, { prefix: '/auth' });
    
    // Core API routes
    await app.register(vappRoutes, { prefix: '/vapps' });
    await app.register(submissionRoutes, { prefix: '/submissions' });
    await app.register(proofRoutes, { prefix: '/proofs' });
    await app.register(verificationRoutes, { prefix: '/verification' });
    await app.register(flagRoutes, { prefix: '/flags' });
    await app.register(stakeRoutes, { prefix: '/stakes' });
    await app.register(exportRoutes, { prefix: '/exports' });
    await app.register(webhookRoutes, { prefix: '/webhooks' });
    await app.register(blockchainRoutes, { prefix: '/blockchain' });
  }, { prefix: '/api/v1' });

  // Root API info
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
    };
  });
}

