import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getPrismaClient } from '@/database/connection';
import { FlagReason, FlagStatus } from '@prisma/client';

const createFlagSchema = z.object({
  vAppId: z.string().uuid(),
  reason: z.enum(['INVALID_PROOF', 'MALICIOUS_CODE', 'COPYRIGHT_VIOLATION', 'SPAM', 'OTHER']),
  description: z.string().max(1000).optional(),
  evidence: z.record(z.any()).optional(),
});

export default async function flagRoutes(app: FastifyInstance) {
  const prisma = getPrismaClient();

  // Create a new flag
  app.post('/', {
    preHandler: [app.authenticate],
    schema: {
      tags: ['Flags'],
      summary: 'Flag a verifiable application',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['vAppId', 'reason'],
        properties: {
          vAppId: { type: 'string', format: 'uuid' },
          reason: { type: 'string', enum: ['INVALID_PROOF', 'MALICIOUS_CODE', 'COPYRIGHT_VIOLATION', 'SPAM', 'OTHER'] },
          description: { type: 'string', maxLength: 1000 },
          evidence: { type: 'object' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            vAppId: { type: 'string' },
            reason: { type: 'string' },
            description: { type: 'string', nullable: true },
            status: { type: 'string' },
            createdAt: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const body = createFlagSchema.parse(request.body);
    const userId = (request as any).user.userId;

    // Check if vApp exists
    const vApp = await prisma.vApp.findUnique({
      where: { id: body.vAppId },
      select: { id: true, authorId: true },
    });

    if (!vApp) {
      return reply.code(404).send({ error: 'VApp not found' });
    }

    // Prevent self-flagging
    if (vApp.authorId === userId) {
      return reply.code(400).send({ error: 'Cannot flag your own vApp' });
    }

    // Check if user already flagged this vApp
    const existingFlag = await prisma.flag.findFirst({
      where: {
        vAppId: body.vAppId,
        flaggerId: userId,
        status: { in: ['PENDING', 'INVESTIGATING'] },
      },
    });

    if (existingFlag) {
      return reply.code(409).send({ error: 'You have already flagged this vApp' });
    }

    const flag = await prisma.flag.create({
      data: {
        flaggerId: userId,
        reason: body.reason as FlagReason,
        vAppId: body.vAppId,
        description: body.description || null,
        evidence: body.evidence as any || null,
      },
      select: {
        id: true,
        vAppId: true,
        reason: true,
        description: true,
        status: true,
        createdAt: true,
      },
    });

    return reply.code(201).send(flag);
  });

  // Get all flags with filtering
  app.get('/', {
    schema: {
      tags: ['Flags'],
      summary: 'List flags',
      querystring: {
        type: 'object',
        properties: {
          vAppId: { type: 'string', format: 'uuid' },
          reason: { type: 'string', enum: ['INVALID_PROOF', 'MALICIOUS_CODE', 'COPYRIGHT_VIOLATION', 'SPAM', 'OTHER'] },
          status: { type: 'string', enum: ['PENDING', 'INVESTIGATING', 'RESOLVED', 'DISMISSED'] },
          flaggerId: { type: 'string', format: 'uuid' },
          page: { type: 'number', minimum: 1, default: 1 },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
          sortBy: { type: 'string', enum: ['createdAt', 'updatedAt', 'reason'], default: 'createdAt' },
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
                  reason: { type: 'string' },
                  description: { type: 'string', nullable: true },
                  status: { type: 'string' },
                  resolvedAt: { type: 'string', nullable: true },
                  vApp: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                    },
                  },
                  flagger: {
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
    const {
      vAppId,
      reason,
      status,
      flaggerId,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = request.query as any;

    const offset = (page - 1) * limit;
    const where: any = {};

    if (vAppId) {
      where.vAppId = vAppId;
    }

    if (reason) {
      where.reason = reason as FlagReason;
    }

    if (status) {
      where.status = status as FlagStatus;
    }

    if (flaggerId) {
      where.flaggerId = flaggerId;
    }

    // Only show flags for public vApps or user's own vApps
    const userId = (request as any).user?.userId;
    if (!userId) {
      where.vApp = { visibility: 'PUBLIC' };
    } else {
      where.vApp = {
        OR: [
          { visibility: 'PUBLIC' },
          { authorId: userId },
        ],
      };
    }

    // Get total count
    const total = await prisma.flag.count({ where });

    // Get flags
    const flags = await prisma.flag.findMany({
      where,
      select: {
        id: true,
        reason: true,
        description: true,
        status: true,
        resolvedAt: true,
        createdAt: true,
        updatedAt: true,
        vApp: {
          select: {
            id: true,
            name: true,
          },
        },
        flagger: {
          select: {
            username: true,
            reputation: true,
          },
        },
      },
      orderBy: { [sortBy]: sortOrder },
      skip: offset,
      take: limit,
    });

    return {
      data: flags,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  });

  // Get a specific flag by ID
  app.get('/:id', {
    schema: {
      tags: ['Flags'],
      summary: 'Get a flag by ID',
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
            reason: { type: 'string' },
            description: { type: 'string', nullable: true },
            evidence: { type: 'object', nullable: true },
            status: { type: 'string' },
            resolvedAt: { type: 'string', nullable: true },
            resolvedBy: { type: 'string', nullable: true },
            vApp: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                version: { type: 'string' },
              },
            },
            flagger: {
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

    const flag = await prisma.flag.findUnique({
      where: { id },
      include: {
        vApp: {
          select: {
            id: true,
            name: true,
            version: true,
            visibility: true,
            authorId: true,
          },
        },
        flagger: {
          select: {
            id: true,
            username: true,
            reputation: true,
          },
        },
      },
    });

    if (!flag) {
      return reply.code(404).send({ error: 'Flag not found' });
    }

    // Check visibility permissions
    if (flag.vApp.visibility === 'PRIVATE') {
      const userId = (request as any).user?.userId;
      if (!userId || userId !== flag.vApp.authorId) {
        return reply.code(404).send({ error: 'Flag not found' });
      }
    }

    return flag;
  });

  // Update flag status (admin only)
  app.put('/:id/status', {
    preHandler: [app.authenticate],
    schema: {
      tags: ['Flags'],
      summary: 'Update flag status (admin only)',
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
        required: ['status'],
        properties: {
          status: { type: 'string', enum: ['INVESTIGATING', 'RESOLVED', 'DISMISSED'] },
          resolution: { type: 'string', maxLength: 1000 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            status: { type: 'string' },
            resolvedAt: { type: 'string', nullable: true },
            resolvedBy: { type: 'string', nullable: true },
            updatedAt: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status, resolution } = request.body as any;
    const userId = (request as any).user.userId;

    // TODO: Add admin check
    // For now, any authenticated user can update flag status
    // In production, you'd check if user has admin privileges

    const flag = await prisma.flag.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!flag) {
      return reply.code(404).send({ error: 'Flag not found' });
    }

    if (flag.status === 'RESOLVED' || flag.status === 'DISMISSED') {
      return reply.code(400).send({ error: 'Flag is already resolved' });
    }

    const updatedFlag = await prisma.flag.update({
      where: { id },
      data: {
        status: status as FlagStatus,
        resolvedAt: ['RESOLVED', 'DISMISSED'].includes(status) ? new Date() : null,
        resolvedBy: ['RESOLVED', 'DISMISSED'].includes(status) ? userId : null,
      },
      select: {
        id: true,
        status: true,
        resolvedAt: true,
        resolvedBy: true,
        updatedAt: true,
      },
    });

    return updatedFlag;
  });

  // Get flag statistics
  app.get('/stats/overview', {
    schema: {
      tags: ['Flags'],
      summary: 'Get flag statistics overview',
      response: {
        200: {
          type: 'object',
          properties: {
            totalFlags: { type: 'number' },
            pendingFlags: { type: 'number' },
            investigatingFlags: { type: 'number' },
            resolvedFlags: { type: 'number' },
            dismissedFlags: { type: 'number' },
            flagsByReason: {
              type: 'object',
              properties: {
                INVALID_PROOF: { type: 'number' },
                MALICIOUS_CODE: { type: 'number' },
                COPYRIGHT_VIOLATION: { type: 'number' },
                SPAM: { type: 'number' },
                OTHER: { type: 'number' },
              },
            },
            averageResolutionTime: { type: 'number' },
            topFlaggers: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  username: { type: 'string' },
                  flagCount: { type: 'number' },
                  reputation: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
  }, async () => {
    // Get flag counts by status
    const flagStats = await prisma.flag.groupBy({
      by: ['status'],
      _count: { status: true },
    });

    const statusCounts = {
      PENDING: 0,
      INVESTIGATING: 0,
      RESOLVED: 0,
      DISMISSED: 0,
    };

    flagStats.forEach(item => {
      statusCounts[item.status] = item._count.status;
    });

    const totalFlags = Object.values(statusCounts).reduce((sum, count) => sum + count, 0);

    // Get flag counts by reason
    const reasonStats = await prisma.flag.groupBy({
      by: ['reason'],
      _count: { reason: true },
    });

    const reasonCounts = {
      INVALID_PROOF: 0,
      MALICIOUS_CODE: 0,
      COPYRIGHT_VIOLATION: 0,
      SPAM: 0,
      OTHER: 0,
    };

    reasonStats.forEach(item => {
      reasonCounts[item.reason] = item._count.reason;
    });

    // Calculate average resolution time
    const resolvedFlags = await prisma.flag.findMany({
      where: {
        status: { in: ['RESOLVED', 'DISMISSED'] },
        resolvedAt: { not: null },
      },
      select: {
        createdAt: true,
        resolvedAt: true,
      },
    });

    let averageResolutionTime = 0;
    if (resolvedFlags.length > 0) {
      const totalTime = resolvedFlags.reduce((sum, flag) => {
        const timeDiff = flag.resolvedAt!.getTime() - flag.createdAt.getTime();
        return sum + timeDiff;
      }, 0);
      averageResolutionTime = totalTime / resolvedFlags.length / (1000 * 60 * 60); // Convert to hours
    }

    // Get top flaggers
    const topFlaggers = await prisma.flag.groupBy({
      by: ['flaggerId'],
      _count: { flaggerId: true },
      orderBy: { _count: { flaggerId: 'desc' } },
      take: 5,
    });

    const topFlaggersWithDetails = await Promise.all(
      topFlaggers.map(async (flagger) => {
        const user = await prisma.user.findUnique({
          where: { id: flagger.flaggerId },
          select: { username: true, reputation: true },
        });

        return {
          username: user?.username || 'Unknown',
          flagCount: flagger._count.flaggerId,
          reputation: user?.reputation || 0,
        };
      })
    );

    return {
      totalFlags,
      pendingFlags: statusCounts.PENDING,
      investigatingFlags: statusCounts.INVESTIGATING,
      resolvedFlags: statusCounts.RESOLVED,
      dismissedFlags: statusCounts.DISMISSED,
      flagsByReason: reasonCounts,
      averageResolutionTime,
      topFlaggers: topFlaggersWithDetails,
    };
  });
}
