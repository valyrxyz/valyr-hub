import { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import jwt from '@fastify/jwt';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from '@/config/environment';

export async function registerPlugins(app: FastifyInstance): Promise<void> {
  // Security plugins
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  });

  await app.register(cors, {
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      
      // In development, allow all origins
      if (config.NODE_ENV === 'development') {
        return callback(null, true);
      }
      
      // In production, you should specify allowed origins
      const allowedOrigins = [
        'https://openvapps.org',
        'https://app.openvapps.org',
        'https://docs.openvapps.org',
      ];
      
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      
      return callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
  });

  // Rate limiting
  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW,
    redis: require('@/services/redis').getRedisClient(),
  });

  // File upload support
  await app.register(multipart, {
    limits: {
      fileSize: config.MAX_FILE_SIZE,
    },
  });

  // JWT authentication
  await app.register(jwt, {
    secret: config.JWT_SECRET,
    sign: {
      expiresIn: config.JWT_EXPIRES_IN,
    },
  });

  // API Documentation
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'OpenvApps Hub API',
        description: 'A neutral infrastructure layer for verifiable applications with zero-knowledge proofs',
        version: '1.0.0',
        contact: {
          name: 'OpenvApps Team',
          url: 'https://openvapps.org',
          email: 'team@openvapps.org',
        },
        license: {
          name: 'MIT',
          url: 'https://opensource.org/licenses/MIT',
        },
      },
      servers: [
        {
          url: `http://localhost:${config.PORT}`,
          description: 'Development server',
        },
        {
          url: 'https://api.openvapps.org',
          description: 'Production server',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
          apiKey: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
          },
        },
      },
      tags: [
        { name: 'Authentication', description: 'User authentication and authorization' },
        { name: 'VApps', description: 'Verifiable application management' },
        { name: 'Submissions', description: 'Proof submission and verification' },
        { name: 'Proofs', description: 'Zero-knowledge proof operations' },
        { name: 'Verification', description: 'Verification logs and status' },
        { name: 'Flags', description: 'Community flagging system' },
        { name: 'Stakes', description: 'Staking and slashing operations' },
        { name: 'Exports', description: 'Export bundles and downloads' },
        { name: 'Webhooks', description: 'Webhook management' },
        { name: 'Blockchain', description: 'Blockchain integration' },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
  });

  // Add authentication decorator
  app.decorate('authenticate', async function (request: any, reply: any) {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.send(err);
    }
  });

  // Add API key authentication decorator
  app.decorate('authenticateApiKey', async function (request: any, reply: any) {
    try {
      const apiKey = request.headers['x-api-key'];
      if (!apiKey) {
        return reply.code(401).send({ error: 'API key required' });
      }

      // Validate API key (implement your logic here)
      const { getPrismaClient } = require('@/database/connection');
      const prisma = getPrismaClient();
      
      const keyRecord = await prisma.aPIKey.findUnique({
        where: { keyHash: apiKey },
        include: { user: true },
      });

      if (!keyRecord || !keyRecord.isActive) {
        return reply.code(401).send({ error: 'Invalid API key' });
      }

      // Update last used timestamp
      await prisma.aPIKey.update({
        where: { id: keyRecord.id },
        data: { lastUsed: new Date() },
      });

      request.user = keyRecord.user;
    } catch (err) {
      reply.send(err);
    }
  });
}

