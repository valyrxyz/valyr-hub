import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { getPrismaClient } from '@/database/connection';
import { VerificationService } from '@/services/verification';
import { logger } from '@/utils/logger';

const verificationRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const prisma = getPrismaClient();
  const verificationService = new VerificationService();

  // Get verification status for a submission
  app.get('/submissions/:id/status', {
    schema: {
      tags: ['Verification'],
      summary: 'Get verification status for a submission',
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
            status: { type: 'string' },
            verifiedAt: { type: 'string', nullable: true },
            proofCount: { type: 'number' },
            validProofCount: { type: 'number' },
            recentLogs: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  level: { type: 'string' },
                  message: { type: 'string' },
                  createdAt: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const status = await verificationService.getVerificationStatus(id);
      return status;
    } catch (error: any) {
      logger.error('Failed to verify submission:', error);
      return reply.code(500).send({ 
        error: 'Verification failed', 
        details: error?.message || 'Unknown error' 
      });
    }
  });

  // Get verification logs with filtering
  app.get('/logs', {
    schema: {
      tags: ['Verification'],
      summary: 'Get verification logs',
      querystring: {
        type: 'object',
        properties: {
          submissionId: { type: 'string', format: 'uuid' },
          proofId: { type: 'string', format: 'uuid' },
          level: { type: 'string', enum: ['INFO', 'WARN', 'ERROR', 'DEBUG'] },
          verifierNode: { type: 'string' },
          chainId: { type: 'number' },
          page: { type: 'number', minimum: 1, default: 1 },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 50 },
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
                  level: { type: 'string' },
                  message: { type: 'string' },
                  details: { type: 'object', nullable: true },
                  verifierNode: { type: 'string', nullable: true },
                  chainId: { type: 'number', nullable: true },
                  txHash: { type: 'string', nullable: true },
                  blockNumber: { type: 'string', nullable: true },
                  createdAt: { type: 'string' },
                  submission: {
                    type: 'object',
                    nullable: true,
                    properties: {
                      id: { type: 'string' },
                      vApp: {
                        type: 'object',
                        properties: {
                          name: { type: 'string' },
                        },
                      },
                    },
                  },
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
      submissionId,
      proofId,
      level,
      verifierNode,
      chainId,
      page = 1,
      limit = 50,
      sortOrder = 'desc',
    } = request.query as any;

    const offset = (page - 1) * limit;
    const where: any = {};

    if (submissionId) {
      where.submissionId = submissionId;
    }

    if (proofId) {
      where.proofId = proofId;
    }

    if (level) {
      where.level = level;
    }

    if (verifierNode) {
      where.verifierNode = verifierNode;
    }

    if (chainId) {
      where.chainId = chainId;
    }

    // Only show logs for public vApps or user's own vApps
    const userId = (request as any).user?.userId;
    if (!userId) {
      where.submission = {
        vApp: { visibility: 'PUBLIC' },
      };
    } else {
      where.submission = {
        vApp: {
          OR: [
            { visibility: 'PUBLIC' },
            { authorId: userId },
          ],
        },
      };
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
        blockNumber: true,
        createdAt: true,
        submission: {
          select: {
            id: true,
            vApp: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: sortOrder },
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

  // Get verification statistics
  app.get('/stats', {
    schema: {
      tags: ['Verification'],
      summary: 'Get verification statistics',
      response: {
        200: {
          type: 'object',
          properties: {
            totalSubmissions: { type: 'number' },
            pendingSubmissions: { type: 'number' },
            processingSubmissions: { type: 'number' },
            verifiedSubmissions: { type: 'number' },
            failedSubmissions: { type: 'number' },
            averageVerificationTime: { type: 'number' },
            verifierNodes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  node: { type: 'string' },
                  processedCount: { type: 'number' },
                  successRate: { type: 'number' },
                },
              },
            },
            blockchainAnchoring: {
              type: 'object',
              properties: {
                ethereum: { type: 'number' },
                arbitrum: { type: 'number' },
                starknet: { type: 'number' },
              },
            },
          },
        },
      },
    },
  }, async () => {
    // Get submission counts by status
    const submissionStats = await prisma.submission.groupBy({
      by: ['status'],
      _count: { status: true },
    });

    const statusCounts = {
      PENDING: 0,
      PROCESSING: 0,
      VERIFIED: 0,
      FAILED: 0,
      FLAGGED: 0,
    };

    submissionStats.forEach(item => {
      statusCounts[item.status] = item._count.status;
    });

    const totalSubmissions = Object.values(statusCounts).reduce((sum, count) => sum + count, 0);

    // Calculate average verification time
    const verifiedSubmissions = await prisma.submission.findMany({
      where: {
        status: 'VERIFIED',
        verifiedAt: { not: null },
      },
      select: {
        createdAt: true,
        verifiedAt: true,
      },
    });

    let averageVerificationTime = 0;
    if (verifiedSubmissions.length > 0) {
      const totalTime = verifiedSubmissions.reduce((sum, submission) => {
        const timeDiff = submission.verifiedAt!.getTime() - submission.createdAt.getTime();
        return sum + timeDiff;
      }, 0);
      averageVerificationTime = totalTime / verifiedSubmissions.length / 1000; // Convert to seconds
    }

    // Get verifier node statistics
    const verifierStats = await prisma.verificationLog.groupBy({
      by: ['verifierNode'],
      where: {
        verifierNode: { not: null },
      },
      _count: { verifierNode: true },
    });

    const verifierNodes = await Promise.all(
      verifierStats.map(async (stat) => {
        const successCount = await prisma.verificationLog.count({
          where: {
            verifierNode: stat.verifierNode,
            level: 'INFO',
            message: { contains: 'verification completed' },
          },
        });

        return {
          node: stat.verifierNode!,
          processedCount: stat._count.verifierNode,
          successRate: stat._count.verifierNode > 0 ? (successCount / stat._count.verifierNode) * 100 : 0,
        };
      })
    );

    // Get blockchain anchoring statistics
    const [ethereumAnchored, arbitrumAnchored, starknetAnchored] = await Promise.all([
      prisma.verificationLog.count({
        where: {
          chainId: 1, // Ethereum mainnet
          txHash: { not: null },
        },
      }),
      prisma.verificationLog.count({
        where: {
          chainId: 42161, // Arbitrum One
          txHash: { not: null },
        },
      }),
      prisma.verificationLog.count({
        where: {
          message: { contains: 'Starknet' },
          txHash: { not: null },
        },
      }),
    ]);

    return {
      totalSubmissions,
      pendingSubmissions: statusCounts.PENDING,
      processingSubmissions: statusCounts.PROCESSING,
      verifiedSubmissions: statusCounts.VERIFIED,
      failedSubmissions: statusCounts.FAILED,
      averageVerificationTime,
      verifierNodes,
      blockchainAnchoring: {
        ethereum: ethereumAnchored,
        arbitrum: arbitrumAnchored,
        starknet: starknetAnchored,
      },
    };
  });

  // Get verifier cluster health
  app.get('/cluster/health', {
    schema: {
      tags: ['Verification'],
      summary: 'Get verifier cluster health status',
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            activeNodes: { type: 'number' },
            totalNodes: { type: 'number' },
            queueLength: { type: 'number' },
            averageResponseTime: { type: 'number' },
            nodes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  status: { type: 'string' },
                  lastSeen: { type: 'string' },
                  processedToday: { type: 'number' },
                  averageTime: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
  }, async () => {
    // Get recent verifier activity (last 24 hours)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const recentActivity = await prisma.verificationLog.groupBy({
      by: ['verifierNode'],
      where: {
        verifierNode: { not: null },
        createdAt: { gte: yesterday },
      },
      _count: { verifierNode: true },
      _max: { createdAt: true },
    });

    const nodes = recentActivity.map(activity => ({
      id: activity.verifierNode!,
      status: 'active',
      lastSeen: activity._max.createdAt!.toISOString(),
      processedToday: activity._count.verifierNode,
      averageTime: Math.random() * 5000 + 1000, // Simulated average time
    }));

    const activeNodes = nodes.length;
    const totalNodes = 3; // Configured cluster size
    const queueLength = await prisma.submission.count({
      where: { status: 'PENDING' },
    });

    const averageResponseTime = nodes.length > 0
      ? nodes.reduce((sum, node) => sum + node.averageTime, 0) / nodes.length
      : 0;

    const status = activeNodes >= totalNodes * 0.5 ? 'healthy' : 'degraded';

    return {
      status,
      activeNodes,
      totalNodes,
      queueLength,
      averageResponseTime,
      nodes,
    };
  });
};

export default verificationRoutes;
