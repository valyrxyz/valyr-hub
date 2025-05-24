import { FastifyInstance } from 'fastify';
import { requireAdmin } from '@/utils/auth';
import { z } from 'zod';
import { getPrismaClient } from '@/database/connection';

const createStakeSchema = z.object({
  vAppId: z.string().uuid(),
  amount: z.string().regex(/^\d+(\.\d{1,8})?$/), // Decimal string with up to 8 decimal places
  currency: z.enum(['ETH', 'ARB', 'STRK']),
  chainId: z.number(),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  blockNumber: z.string().regex(/^\d+$/),
});

export default async function stakeRoutes(app: FastifyInstance) {
  const prisma = getPrismaClient();

  // Create a new stake
  app.post('/', {
    preHandler: [app.authenticate, requireAdmin],
    schema: {
      tags: ['Stakes'],
      summary: 'Create a new stake for a vApp',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['vAppId', 'amount', 'currency', 'chainId', 'txHash', 'blockNumber'],
        properties: {
          vAppId: { type: 'string', format: 'uuid' },
          amount: { type: 'string', pattern: '^\\d+(\\.\\d{1,8})?$' },
          currency: { type: 'string', enum: ['ETH', 'ARB', 'STRK'] },
          chainId: { type: 'number' },
          txHash: { type: 'string', pattern: '^0x[a-fA-F0-9]{64}$' },
          blockNumber: { type: 'string', pattern: '^\\d+$' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            vAppId: { type: 'string' },
            amount: { type: 'string' },
            currency: { type: 'string' },
            chainId: { type: 'number' },
            status: { type: 'string' },
            txHash: { type: 'string' },
            blockNumber: { type: 'string' },
            createdAt: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const body = createStakeSchema.parse(request.body);
    const userId = (request as any).user.userId;

    // Check if vApp exists
    const vApp = await prisma.vApp.findUnique({
      where: { id: body.vAppId },
      select: { id: true, name: true },
    });

    if (!vApp) {
      return reply.code(404).send({ error: 'VApp not found' });
    }

    // Check if transaction hash already exists
    const existingStake = await prisma.stake.findFirst({
      where: { txHash: body.txHash },
    });

    if (existingStake) {
      return reply.code(409).send({ error: 'Transaction hash already used' });
    }

    const stake = await prisma.stake.create({
      data: {
        ...body,
        stakerId: userId,
        amount: body.amount,
        blockNumber: BigInt(body.blockNumber),
      },
      select: {
        id: true,
        vAppId: true,
        amount: true,
        currency: true,
        chainId: true,
        status: true,
        txHash: true,
        blockNumber: true,
        createdAt: true,
      },
    });

    return reply.code(201).send({
      ...stake,
      blockNumber: stake.blockNumber.toString(),
    });
  });

  // Get all stakes with filtering
  app.get('/', {
    schema: {
      tags: ['Stakes'],
      summary: 'List stakes',
      querystring: {
        type: 'object',
        properties: {
          vAppId: { type: 'string', format: 'uuid' },
          stakerId: { type: 'string', format: 'uuid' },
          currency: { type: 'string', enum: ['ETH', 'ARB', 'STRK'] },
          chainId: { type: 'number' },
          status: { type: 'string', enum: ['ACTIVE', 'SLASHED', 'WITHDRAWN'] },
          page: { type: 'number', minimum: 1, default: 1 },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
          sortBy: { type: 'string', enum: ['createdAt', 'amount', 'blockNumber'], default: 'createdAt' },
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
                  amount: { type: 'string' },
                  currency: { type: 'string' },
                  chainId: { type: 'number' },
                  status: { type: 'string' },
                  txHash: { type: 'string' },
                  blockNumber: { type: 'string' },
                  slashedAt: { type: 'string', nullable: true },
                  slashReason: { type: 'string', nullable: true },
                  vApp: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                    },
                  },
                  staker: {
                    type: 'object',
                    properties: {
                      username: { type: 'string' },
                      reputation: { type: 'number' },
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
    const {
      vAppId,
      stakerId,
      currency,
      chainId,
      status,
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

    if (stakerId) {
      where.stakerId = stakerId;
    }

    if (currency) {
      where.currency = currency;
    }

    if (chainId) {
      where.chainId = chainId;
    }

    if (status) {
      where.status = status;
    }

    // Only show stakes for public vApps or user's own vApps
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
    const total = await prisma.stake.count({ where });

    // Get stakes
    const stakes = await prisma.stake.findMany({
      where,
      select: {
        id: true,
        amount: true,
        currency: true,
        chainId: true,
        status: true,
        txHash: true,
        blockNumber: true,
        slashedAt: true,
        slashReason: true,
        createdAt: true,
        vApp: {
          select: {
            id: true,
            name: true,
          },
        },
        staker: {
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
      data: stakes.map(stake => ({
        ...stake,
        blockNumber: stake.blockNumber.toString(),
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  });

  // Get a specific stake by ID
  app.get('/:id', {
    schema: {
      tags: ['Stakes'],
      summary: 'Get a stake by ID',
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
            amount: { type: 'string' },
            currency: { type: 'string' },
            chainId: { type: 'number' },
            status: { type: 'string' },
            txHash: { type: 'string' },
            blockNumber: { type: 'string' },
            slashedAt: { type: 'string', nullable: true },
            slashReason: { type: 'string', nullable: true },
            vApp: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                version: { type: 'string' },
              },
            },
            staker: {
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

    const stake = await prisma.stake.findUnique({
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
        staker: {
          select: {
            id: true,
            username: true,
            reputation: true,
          },
        },
      },
    });

    if (!stake) {
      return reply.code(404).send({ error: 'Stake not found' });
    }

    // Check visibility permissions
    if (stake.vApp.visibility === 'PRIVATE') {
      const userId = (request as any).user?.userId;
      if (!userId || userId !== stake.vApp.authorId) {
        return reply.code(404).send({ error: 'Stake not found' });
      }
    }

    return {
      ...stake,
      blockNumber: stake.blockNumber.toString(),
    };
  });

  // Slash a stake (admin only)
  app.post('/:id/slash', {
    preHandler: [app.authenticate, requireAdmin],
    schema: {
      tags: ['Stakes'],
      summary: 'Slash a stake (admin only)',
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
        required: ['reason'],
        properties: {
          reason: { type: 'string', maxLength: 500 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            status: { type: 'string' },
            slashedAt: { type: 'string' },
            slashReason: { type: 'string' },
            updatedAt: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { reason } = request.body as any;


    const stake = await prisma.stake.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!stake) {
      return reply.code(404).send({ error: 'Stake not found' });
    }

    if (stake.status !== 'ACTIVE') {
      return reply.code(400).send({ error: 'Only active stakes can be slashed' });
    }

    const updatedStake = await prisma.stake.update({
      where: { id },
      data: {
        status: 'SLASHED',
        slashedAt: new Date(),
        slashReason: reason,
      },
      select: {
        id: true,
        status: true,
        slashedAt: true,
        slashReason: true,
        updatedAt: true,
      },
    });

    return updatedStake;
  });

  // Get stake statistics
  app.get('/stats/overview', {
    schema: {
      tags: ['Stakes'],
      summary: 'Get stake statistics overview',
      response: {
        200: {
          type: 'object',
          properties: {
            totalStakes: { type: 'number' },
            activeStakes: { type: 'number' },
            slashedStakes: { type: 'number' },
            withdrawnStakes: { type: 'number' },
            totalValueLocked: {
              type: 'object',
              properties: {
                ETH: { type: 'string' },
                ARB: { type: 'string' },
                STRK: { type: 'string' },
              },
            },
            stakesByCurrency: {
              type: 'object',
              properties: {
                ETH: { type: 'number' },
                ARB: { type: 'number' },
                STRK: { type: 'number' },
              },
            },
            stakesByChain: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  chainId: { type: 'number' },
                  count: { type: 'number' },
                  totalValue: { type: 'string' },
                },
              },
            },
            averageStakeSize: {
              type: 'object',
              properties: {
                ETH: { type: 'string' },
                ARB: { type: 'string' },
                STRK: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async () => {
    // Get stake counts by status
    const stakeStats = await prisma.stake.groupBy({
      by: ['status'],
      _count: { status: true },
    });

    const statusCounts = {
      ACTIVE: 0,
      SLASHED: 0,
      WITHDRAWN: 0,
    };

    stakeStats.forEach(item => {
      statusCounts[item.status] = item._count.status;
    });

    const totalStakes = Object.values(statusCounts).reduce((sum, count) => sum + count, 0);

    // Get total value locked by currency
    const tvlStats = await prisma.stake.groupBy({
      by: ['currency'],
      where: { status: 'ACTIVE' },
      _sum: { amount: true },
      _count: { currency: true },
    });

    const totalValueLocked = { ETH: '0', ARB: '0', STRK: '0' };
    const stakesByCurrency = { ETH: 0, ARB: 0, STRK: 0 };
    const averageStakeSize = { ETH: '0', ARB: '0', STRK: '0' };

    tvlStats.forEach(item => {
      const currency = item.currency as 'ETH' | 'ARB' | 'STRK';
      totalValueLocked[currency] = item._sum.amount?.toString() || '0';
      stakesByCurrency[currency] = item._count.currency;
      
      if (item._count.currency > 0 && item._sum.amount) {
        const avgSize = item._sum.amount.toNumber() / item._count.currency;
        averageStakeSize[currency] = avgSize.toFixed(8);
      }
    });

    // Get stakes by chain
    const chainStats = await prisma.stake.groupBy({
      by: ['chainId'],
      where: { status: 'ACTIVE' },
      _count: { chainId: true },
      _sum: { amount: true },
    });

    const stakesByChain = chainStats.map(item => ({
      chainId: item.chainId,
      count: item._count.chainId,
      totalValue: item._sum.amount?.toString() || '0',
    }));

    return {
      totalStakes,
      activeStakes: statusCounts.ACTIVE,
      slashedStakes: statusCounts.SLASHED,
      withdrawnStakes: statusCounts.WITHDRAWN,
      totalValueLocked,
      stakesByCurrency,
      stakesByChain,
      averageStakeSize,
    };
  });

  // Get user's stakes
  app.get('/my-stakes', {
    preHandler: [app.authenticate, requireAdmin],
    schema: {
      tags: ['Stakes'],
      summary: 'Get current user stakes',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['ACTIVE', 'SLASHED', 'WITHDRAWN'] },
          currency: { type: 'string', enum: ['ETH', 'ARB', 'STRK'] },
          page: { type: 'number', minimum: 1, default: 1 },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
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
                  amount: { type: 'string' },
                  currency: { type: 'string' },
                  chainId: { type: 'number' },
                  status: { type: 'string' },
                  txHash: { type: 'string' },
                  blockNumber: { type: 'string' },
                  slashedAt: { type: 'string', nullable: true },
                  slashReason: { type: 'string', nullable: true },
                  vApp: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                      status: { type: 'string' },
                    },
                  },
                  createdAt: { type: 'string' },
                },
              },
            },
            summary: {
              type: 'object',
              properties: {
                totalStaked: {
                  type: 'object',
                  properties: {
                    ETH: { type: 'string' },
                    ARB: { type: 'string' },
                    STRK: { type: 'string' },
                  },
                },
                activeStakes: { type: 'number' },
                slashedStakes: { type: 'number' },
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
    const userId = (request as any).user.userId;
    const { status, currency, page = 1, limit = 20 } = request.query as any;

    const offset = (page - 1) * limit;
    const where: any = { stakerId: userId };

    if (status) {
      where.status = status;
    }

    if (currency) {
      where.currency = currency;
    }

    // Get total count
    const total = await prisma.stake.count({ where });

    // Get stakes
    const stakes = await prisma.stake.findMany({
      where,
      select: {
        id: true,
        amount: true,
        currency: true,
        chainId: true,
        status: true,
        txHash: true,
        blockNumber: true,
        slashedAt: true,
        slashReason: true,
        createdAt: true,
        vApp: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    });

    // Get summary statistics
    const summaryStats = await prisma.stake.groupBy({
      by: ['currency', 'status'],
      where: { stakerId: userId },
      _sum: { amount: true },
      _count: { currency: true },
    });

    const totalStaked = { ETH: '0', ARB: '0', STRK: '0' };
    let activeStakes = 0;
    let slashedStakes = 0;

    summaryStats.forEach(item => {
      const currency = item.currency as 'ETH' | 'ARB' | 'STRK';
      
      if (item.status === 'ACTIVE') {
        totalStaked[currency] = (parseFloat(totalStaked[currency]) + (item._sum.amount?.toNumber() || 0)).toFixed(8);
        activeStakes += item._count.currency;
      } else if (item.status === 'SLASHED') {
        slashedStakes += item._count.currency;
      }
    });

    return {
      data: stakes.map(stake => ({
        ...stake,
        blockNumber: stake.blockNumber.toString(),
      })),
      summary: {
        totalStaked,
        activeStakes,
        slashedStakes,
      },
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  });
}

