import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getPrismaClient } from '@/database/connection';
import { VAppStatus, Visibility } from '@prisma/client';

const createVAppSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  version: z.string().min(1).max(50),
  repoUrl: z.string().url().optional(),
  metadata: z.record(z.any()),
  tags: z.array(z.string()).default([]),
  category: z.string().optional(),
  visibility: z.enum(['PUBLIC', 'PRIVATE', 'UNLISTED']).default('PUBLIC'),
});

const updateVAppSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).optional(),
  version: z.string().min(1).max(50).optional(),
  repoUrl: z.string().url().optional(),
  metadata: z.record(z.any()).optional(),
  tags: z.array(z.string()).optional(),
  category: z.string().optional(),
  visibility: z.enum(['PUBLIC', 'PRIVATE', 'UNLISTED']).optional(),
});

const searchVAppsSchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(['PENDING', 'VERIFIED', 'FLAGGED', 'SUSPENDED', 'ARCHIVED']).optional(),
  author: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt', 'updatedAt', 'name', 'reputation']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const vappRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const prisma = getPrismaClient();

  // Create a new vApp
  app.post('/', {
    preHandler: [app.authenticate],
    schema: {
      tags: ['VApps'],
      summary: 'Create a new verifiable application',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['name', 'version', 'metadata'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          description: { type: 'string', maxLength: 1000 },
          version: { type: 'string', minLength: 1, maxLength: 50 },
          repoUrl: { type: 'string', format: 'uri' },
          metadata: { type: 'object' },
          tags: { type: 'array', items: { type: 'string' } },
          category: { type: 'string' },
          visibility: { type: 'string', enum: ['PUBLIC', 'PRIVATE', 'UNLISTED'] },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string', nullable: true },
            version: { type: 'string' },
            status: { type: 'string' },
            visibility: { type: 'string' },
            createdAt: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const body = createVAppSchema.parse(request.body);
    const userId = (request as any).user.userId;

    // Check if vApp with same name already exists for this user
    const existingVApp = await prisma.vApp.findFirst({
      where: {
        name: body.name,
        authorId: userId,
      },
    });

    if (existingVApp) {
      return reply.code(409).send({
        error: 'VApp with this name already exists',
      });
    }

    const vApp = await prisma.vApp.create({
      data: {
        authorId: userId,
        visibility: body.visibility as Visibility,
        version: body.version,
        tags: body.tags,
        name: body.name,
        metadata: body.metadata,
        description: body.description || null,
        repoUrl: body.repoUrl || null,
        category: body.category || null,
      },
      select: {
        id: true,
        name: true,
        description: true,
        version: true,
        status: true,
        visibility: true,
        createdAt: true,
      },
    });

    return reply.code(201).send(vApp);
  });

  // Get all vApps with search and filtering
  app.get('/', {
    schema: {
      tags: ['VApps'],
      summary: 'Search and list verifiable applications',
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'Search query' },
          category: { type: 'string', description: 'Filter by category' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags' },
          status: { type: 'string', enum: ['PENDING', 'VERIFIED', 'FLAGGED', 'SUSPENDED', 'ARCHIVED'] },
          author: { type: 'string', description: 'Filter by author username' },
          page: { type: 'number', minimum: 1, default: 1 },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
          sortBy: { type: 'string', enum: ['createdAt', 'updatedAt', 'name', 'reputation'], default: 'createdAt' },
          sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string', nullable: true },
                  version: { type: 'string' },
                  status: { type: 'string' },
                  visibility: { type: 'string' },
                  tags: { type: 'array', items: { type: 'string' } },
                  category: { type: 'string', nullable: true },
                  isVerified: { type: 'boolean' },
                  author: {
                    type: 'object',
                    properties: {
                      username: { type: 'string' },
                      reputation: { type: 'number' },
                    },
                  },
                  createdAt: { type: 'string' },
                  updatedAt: { type: 'string' },
                },
              },
            },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'number' },
                limit: { type: 'number' },
                total: { type: 'number' },
                pages: { type: 'number' },
              },
            },
          },
        },
      },
    },
  }, async (request) => {
    const query = searchVAppsSchema.parse(request.query);
    const offset = (query.page - 1) * query.limit;

    // Build where clause
    const where: any = {
      visibility: 'PUBLIC', // Only show public vApps by default
    };

    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    if (query.category) {
      where.category = query.category;
    }

    if (query.tags && query.tags.length > 0) {
      where.tags = { hasSome: query.tags };
    }

    if (query.status) {
      where.status = query.status as VAppStatus;
    }

    if (query.author) {
      where.author = {
        username: query.author,
      };
    }

    // Get total count
    const total = await prisma.vApp.count({ where });

    // Get vApps
    const vApps = await prisma.vApp.findMany({
      where,
      select: {
        id: true,
        name: true,
        description: true,
        version: true,
        status: true,
        visibility: true,
        tags: true,
        category: true,
        isVerified: true,
        createdAt: true,
        updatedAt: true,
        author: {
          select: {
            username: true,
            reputation: true,
          },
        },
      },
      orderBy: { [query.sortBy]: query.sortOrder },
      skip: offset,
      take: query.limit,
    });

    return {
      data: vApps,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      },
    };
  });

  // Get a specific vApp by ID
  app.get('/:id', {
    schema: {
      tags: ['VApps'],
      summary: 'Get a verifiable application by ID',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string', nullable: true },
            version: { type: 'string' },
            status: { type: 'string' },
            visibility: { type: 'string' },
            repoUrl: { type: 'string', nullable: true },
            metadata: { type: 'object' },
            tags: { type: 'array', items: { type: 'string' } },
            category: { type: 'string', nullable: true },
            isVerified: { type: 'boolean' },
            verifiedAt: { type: 'string', nullable: true },
            author: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                username: { type: 'string' },
                reputation: { type: 'number' },
              },
            },
            createdAt: { type: 'string' },
            updatedAt: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const vApp = await prisma.vApp.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            reputation: true,
          },
        },
      },
    });

    if (!vApp) {
      return reply.code(404).send({ error: 'VApp not found' });
    }

    // Check visibility permissions
    if (vApp.visibility === 'PRIVATE') {
      // Only author can see private vApps
      const userId = (request as any).user?.userId;
      if (!userId || userId !== vApp.authorId) {
        return reply.code(404).send({ error: 'VApp not found' });
      }
    }

    return vApp;
  });

  // Update a vApp
  app.put('/:id', {
    preHandler: [app.authenticate],
    schema: {
      tags: ['VApps'],
      summary: 'Update a verifiable application',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          description: { type: 'string', maxLength: 1000 },
          version: { type: 'string', minLength: 1, maxLength: 50 },
          repoUrl: { type: 'string', format: 'uri' },
          metadata: { type: 'object' },
          tags: { type: 'array', items: { type: 'string' } },
          category: { type: 'string' },
          visibility: { type: 'string', enum: ['PUBLIC', 'PRIVATE', 'UNLISTED'] },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string', nullable: true },
            version: { type: 'string' },
            status: { type: 'string' },
            visibility: { type: 'string' },
            updatedAt: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateVAppSchema.parse(request.body);
    const userId = (request as any).user.userId;

    // Check if vApp exists and user owns it
    const existingVApp = await prisma.vApp.findUnique({
      where: { id },
      select: { authorId: true },
    });

    if (!existingVApp) {
      return reply.code(404).send({ error: 'VApp not found' });
    }

    if (existingVApp.authorId !== userId) {
      return reply.code(403).send({ error: 'Not authorized to update this vApp' });
    }

    const updateData: any = {};
    if (body.visibility !== undefined) updateData.visibility = body.visibility;
    if (body.version !== undefined) updateData.version = body.version;
    if (body.tags !== undefined) updateData.tags = body.tags;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.name !== undefined) updateData.name = body.name;
    if (body.repoUrl !== undefined) updateData.repoUrl = body.repoUrl;
    if (body.metadata !== undefined) updateData.metadata = body.metadata;
    if (body.category !== undefined) updateData.category = body.category;

    const vApp = await prisma.vApp.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        description: true,
        version: true,
        status: true,
        visibility: true,
        updatedAt: true,
      },
    });

    return vApp;
  });

  // Delete a vApp
  app.delete('/:id', {
    preHandler: [app.authenticate],
    schema: {
      tags: ['VApps'],
      summary: 'Delete a verifiable application',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
      response: {
        204: { type: 'null' },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = (request as any).user.userId;

    // Check if vApp exists and user owns it
    const existingVApp = await prisma.vApp.findUnique({
      where: { id },
      select: { authorId: true },
    });

    if (!existingVApp) {
      return reply.code(404).send({ error: 'VApp not found' });
    }

    if (existingVApp.authorId !== userId) {
      return reply.code(403).send({ error: 'Not authorized to delete this vApp' });
    }

    await prisma.vApp.delete({
      where: { id },
    });

    return reply.code(204).send();
  });

  // Get vApp statistics
  app.get('/:id/stats', {
    schema: {
      tags: ['VApps'],
      summary: 'Get vApp statistics',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            totalSubmissions: { type: 'number' },
            verifiedSubmissions: { type: 'number' },
            totalProofs: { type: 'number' },
            validProofs: { type: 'number' },
            totalFlags: { type: 'number' },
            totalStakes: { type: 'number' },
            totalExports: { type: 'number' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    // Check if vApp exists
    const vApp = await prisma.vApp.findUnique({
      where: { id },
      select: { id: true, visibility: true, authorId: true },
    });

    if (!vApp) {
      return reply.code(404).send({ error: 'VApp not found' });
    }

    // Check visibility permissions
    if (vApp.visibility === 'PRIVATE') {
      const userId = (request as any).user?.userId;
      if (!userId || userId !== vApp.authorId) {
        return reply.code(404).send({ error: 'VApp not found' });
      }
    }

    // Get statistics
    const [
      totalSubmissions,
      verifiedSubmissions,
      totalProofs,
      validProofs,
      totalFlags,
      totalStakes,
      totalExports,
    ] = await Promise.all([
      prisma.submission.count({ where: { vAppId: id } }),
      prisma.submission.count({ where: { vAppId: id, status: 'VERIFIED' } }),
      prisma.proof.count({ where: { vAppId: id } }),
      prisma.proof.count({ where: { vAppId: id, isValid: true } }),
      prisma.flag.count({ where: { vAppId: id } }),
      prisma.stake.count({ where: { vAppId: id } }),
      prisma.export.count({ where: { vAppId: id } }),
    ]);

    return {
      totalSubmissions,
      verifiedSubmissions,
      totalProofs,
      validProofs,
      totalFlags,
      totalStakes,
      totalExports,
    };
  });
};

export default vappRoutes;
