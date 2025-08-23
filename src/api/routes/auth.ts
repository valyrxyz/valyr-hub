import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getPrismaClient } from '@/database/connection';
import { hashApiKey, generateApiKey } from '@/utils/crypto';

const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(50),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  expiresAt: z.string().datetime().optional(),
});

export default async function authRoutes(app: FastifyInstance) {
  const prisma = getPrismaClient();

  // Register new user
  app.post('/register', {
    schema: {
      tags: ['Authentication'],
      summary: 'Register a new user',
      body: {
        type: 'object',
        required: ['email', 'username', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          username: { type: 'string', minLength: 3, maxLength: 50 },
          password: { type: 'string', minLength: 8 },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                username: { type: 'string' },
                role: { type: 'string' },
                createdAt: { type: 'string' },
              },
            },
            token: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const body = registerSchema.parse(request.body);

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: body.email },
          { username: body.username },
        ],
      },
    });

    if (existingUser) {
      return reply.code(409).send({
        error: 'User with this email or username already exists',
      });
    }

    // Create user
    const hashedPassword = await hashApiKey(body.password);
    const user = await prisma.user.create({
      data: {
        email: body.email,
        username: body.username,
        passwordHash: hashedPassword,
      },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        createdAt: true,
      },
    });

    // Generate JWT token
    const token = app.jwt.sign({ userId: user.id });

    return reply.code(201).send({ user, token });
  });

  // Login user
  app.post('/login', {
    schema: {
      tags: ['Authentication'],
      summary: 'Login user',
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                username: { type: 'string' },
              },
            },
            token: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const body = loginSchema.parse(request.body);

    // Find user (in production, verify password hash)
    const user = await prisma.user.findUnique({
      where: { email: body.email },
      select: {
        id: true,
        email: true,
        username: true,
      },
    });

    if (!user) {
      return reply.code(401).send({
        error: 'Invalid credentials',
      });
    }

    // Generate JWT token
    const token = app.jwt.sign({ userId: user.id });

    return { user, token };
  });

  // Get current user profile
  app.get('/profile', {
    preHandler: [app.authenticate],
    schema: {
      tags: ['Authentication'],
      summary: 'Get current user profile',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string' },
            username: { type: 'string' },
            avatar: { type: 'string', nullable: true },
            reputation: { type: 'number' },
            isVerified: { type: 'boolean' },
            createdAt: { type: 'string' },
          },
        },
      },
    },
  }, async (request) => {
    const user = await prisma.user.findUnique({
      where: { id: (request as any).user.userId },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        createdAt: true,
      },
    });

    return user;
  });

  // Create API key
  app.post('/api-keys', {
    preHandler: [app.authenticate],
    schema: {
      tags: ['Authentication'],
      summary: 'Create a new API key',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          expiresAt: { type: 'string', format: 'date-time' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            key: { type: 'string' },
            createdAt: { type: 'string' },
            expiresAt: { type: 'string', nullable: true },
          },
        },
      },
    },
  }, async (request, reply) => {
    const body = createApiKeySchema.parse(request.body);
    const userId = (request as any).user.userId;

    const apiKeyValue = generateApiKey();
    const keyHash = hashApiKey(apiKeyValue);

    const apiKey = await prisma.aPIKey.create({
      data: {
        name: body.name,
        keyHash,
        userId,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
        expiresAt: true,
        lastUsed: true,
      },
    });

    return reply.code(201).send({
      ...apiKey,
      key: apiKeyValue, // Only return the actual key once
    });
  });

  // List API keys
  app.get('/api-keys', {
    preHandler: app.authenticate,
    schema: {
      tags: ['Auth'],
      summary: 'List user API keys',
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              createdAt: { type: 'string' },
              expiresAt: { type: 'string', nullable: true },
              lastUsed: { type: 'string', nullable: true },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const userId = (request as any).user.userId;

    const apiKeys = await prisma.aPIKey.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        createdAt: true,
        expiresAt: true,
        lastUsed: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send(apiKeys);
  });

  // Revoke API key
  app.delete('/api-keys/:id', {
    preHandler: app.authenticate,
    schema: {
      tags: ['Auth'],
      summary: 'Revoke an API key',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = (request as any).user.userId;

    await prisma.aPIKey.deleteMany({
      where: {
        id,
        userId, // Ensure user can only delete their own keys
      },
    });

    return reply.code(204).send();
  });
}
