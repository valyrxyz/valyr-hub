import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getPrismaClient } from '@/database/connection';
import { ProofType } from '@prisma/client';

const searchProofsSchema = z.object({
  vAppId: z.string().uuid().optional(),
  submissionId: z.string().uuid().optional(),
  type: z.enum(['GROTH16', 'PLONK', 'STARK']).optional(),
  isValid: z.coerce.boolean().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt', 'verifiedAt', 'type']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export default async function proofRoutes(app: FastifyInstance) {
  const prisma = getPrismaClient();

  // Get all proofs with filtering
  app.get('/', {
    schema: {
      tags: ['Proofs'],
      summary: 'List zero-knowledge proofs',
      querystring: {
        type: 'object',
        properties: {
          vAppId: { type: 'string', format: 'uuid' },
          submissionId: { type: 'string', format: 'uuid' },
          type: { type: 'string', enum: ['GROTH16', 'PLONK', 'STARK'] },
          isValid: { type: 'boolean' },
          page: { type: 'number', minimum: 1, default: 1 },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
          sortBy: { type: 'string', enum: ['createdAt', 'verifiedAt', 'type'], default: 'createdAt' },
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
                  type: { type: 'string' },
                  circuitHash: { type: 'string' },
                  isValid: { type: 'boolean' },
                  verifiedAt: { type: 'string', nullable: true },
                  verifierNode: { type: 'string', nullable: true },
                  ethereumTxHash: { type: 'string', nullable: true },
                  arbitrumTxHash: { type: 'string', nullable: true },
                  starknetTxHash: { type: 'string', nullable: true },
                  vApp: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                    },
                  },
                  submission: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      status: { type: 'string' },
                    },
                  },
                  createdAt: { type: 'string' },
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
    const query = searchProofsSchema.parse(request.query);
    const offset = (query.page - 1) * query.limit;

    // Build where clause
    const where: any = {};

    if (query.vAppId) {
      where.vAppId = query.vAppId;
    }

    if (query.submissionId) {
      where.submissionId = query.submissionId;
    }

    if (query.type) {
      where.type = query.type as ProofType;
    }

    if (query.isValid !== undefined) {
      where.isValid = query.isValid;
    }

    // Only show proofs for public vApps or user's own vApps
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
    const total = await prisma.proof.count({ where });

    // Get proofs
    const proofs = await prisma.proof.findMany({
      where,
      select: {
        id: true,
        type: true,
        circuitHash: true,
        isValid: true,
        verifiedAt: true,
        verifierNode: true,
        ethereumTxHash: true,
        arbitrumTxHash: true,
        starknetTxHash: true,
        createdAt: true,
        vApp: {
          select: {
            id: true,
            name: true,
          },
        },
        submission: {
          select: {
            id: true,
            status: true,
          },
        },
      },
      orderBy: { [query.sortBy]: query.sortOrder },
      skip: offset,
      take: query.limit,
    });

    return {
      data: proofs,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      },
    };
  });

  // Get a specific proof by ID
  app.get('/:id', {
    schema: {
      tags: ['Proofs'],
      summary: 'Get a zero-knowledge proof by ID',
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
            type: { type: 'string' },
            circuitHash: { type: 'string' },
            proofData: { type: 'object' },
            publicInputs: { type: 'object' },
            verifierKey: { type: 'object' },
            isValid: { type: 'boolean' },
            verifiedAt: { type: 'string', nullable: true },
            verifierNode: { type: 'string', nullable: true },
            ethereumTxHash: { type: 'string', nullable: true },
            arbitrumTxHash: { type: 'string', nullable: true },
            starknetTxHash: { type: 'string', nullable: true },
            vApp: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                version: { type: 'string' },
              },
            },
            submission: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                status: { type: 'string' },
                createdAt: { type: 'string' },
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

    const proof = await prisma.proof.findUnique({
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
        submission: {
          select: {
            id: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    if (!proof) {
      return reply.code(404).send({ error: 'Proof not found' });
    }

    // Check visibility permissions
    if (proof.vApp.visibility === 'PRIVATE') {
      const userId = (request as any).user?.userId;
      if (!userId || userId !== proof.vApp.authorId) {
        return reply.code(404).send({ error: 'Proof not found' });
      }
    }

    return proof;
  });

  // Get proof verification logs
  app.get('/:id/logs', {
    schema: {
      tags: ['Proofs'],
      summary: 'Get verification logs for a proof',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          level: { type: 'string', enum: ['INFO', 'WARN', 'ERROR', 'DEBUG'] },
          page: { type: 'number', minimum: 1, default: 1 },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 50 },
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
                  level: { type: 'string' },
                  message: { type: 'string' },
                  details: { type: 'object', nullable: true },
                  verifierNode: { type: 'string', nullable: true },
                  chainId: { type: 'number', nullable: true },
                  txHash: { type: 'string', nullable: true },
                  createdAt: { type: 'string' },
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
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { level, page = 1, limit = 50 } = request.query as any;

    // Check if proof exists and is accessible
    const proof = await prisma.proof.findUnique({
      where: { id },
      include: {
        vApp: {
          select: {
            visibility: true,
            authorId: true,
          },
        },
      },
    });

    if (!proof) {
      return reply.code(404).send({ error: 'Proof not found' });
    }

    // Check visibility permissions
    if (proof.vApp.visibility === 'PRIVATE') {
      const userId = (request as any).user?.userId;
      if (!userId || userId !== proof.vApp.authorId) {
        return reply.code(404).send({ error: 'Proof not found' });
      }
    }

    const offset = (page - 1) * limit;
    const where: any = { proofId: id };

    if (level) {
      where.level = level;
    }

    // Get total count
    const total = await prisma.verificationLog.count({ where });

    // Get logs
    const logs = await prisma.verificationLog.findMany({
      where,
      select: {
        id: true,
        level: true,
        message: true,
        details: true,
        verifierNode: true,
        chainId: true,
        txHash: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    });

    return {
      data: logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  });

  // Get proof statistics
  app.get('/stats/overview', {
    schema: {
      tags: ['Proofs'],
      summary: 'Get proof statistics overview',
      response: {
        200: {
          type: 'object',
          properties: {
            totalProofs: { type: 'number' },
            validProofs: { type: 'number' },
            invalidProofs: { type: 'number' },
            proofsByType: {
              type: 'object',
              properties: {
                GROTH16: { type: 'number' },
                PLONK: { type: 'number' },
                STARK: { type: 'number' },
              },
            },
            anchoredProofs: {
              type: 'object',
              properties: {
                ethereum: { type: 'number' },
                arbitrum: { type: 'number' },
                starknet: { type: 'number' },
              },
            },
            recentActivity: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  date: { type: 'string' },
                  count: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
  }, async () => {
    // Get basic counts
    const [totalProofs, validProofs, invalidProofs] = await Promise.all([
      prisma.proof.count(),
      prisma.proof.count({ where: { isValid: true } }),
      prisma.proof.count({ where: { isValid: false } }),
    ]);

    // Get proof counts by type
    const proofsByType = await prisma.proof.groupBy({
      by: ['type'],
      _count: { type: true },
    });

    const proofTypeStats = {
      GROTH16: 0,
      PLONK: 0,
      STARK: 0,
    };

    proofsByType.forEach(item => {
      proofTypeStats[item.type] = item._count.type;
    });

    // Get anchored proof counts
    const [ethereumAnchored, arbitrumAnchored, starknetAnchored] = await Promise.all([
      prisma.proof.count({ where: { ethereumTxHash: { not: null } } }),
      prisma.proof.count({ where: { arbitrumTxHash: { not: null } } }),
      prisma.proof.count({ where: { starknetTxHash: { not: null } } }),
    ]);

    // Get recent activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentActivity = await prisma.proof.groupBy({
      by: ['createdAt'],
      where: {
        createdAt: {
          gte: sevenDaysAgo,
        },
      },
      _count: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    // Format recent activity by date
    const activityByDate = recentActivity.reduce((acc, item) => {
      const date = item.createdAt.toISOString().split('T')[0];
      const count = item._count?.id || 0;
      if (date) {
        acc[date] = (acc[date] || 0) + count;
      }
      return acc;
    }, {} as Record<string, number>);

    const formattedActivity = Object.entries(activityByDate).map(([date, count]) => ({
      date,
      count,
    }));

    return {
      totalProofs,
      validProofs,
      invalidProofs,
      proofsByType: proofTypeStats,
      anchoredProofs: {
        ethereum: ethereumAnchored,
        arbitrum: arbitrumAnchored,
        starknet: starknetAnchored,
      },
      recentActivity: formattedActivity,
    };
  });
}
