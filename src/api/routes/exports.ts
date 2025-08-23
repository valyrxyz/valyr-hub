import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getPrismaClient } from '@/database/connection';
import { ExportType } from '@prisma/client';
import { IPFSService } from '@/services/ipfs';

const createExportSchema = z.object({
  vAppId: z.string().uuid(),
  type: z.enum(['PROOF_BUNDLE', 'SOURCE_CODE', 'METADATA', 'FULL_PACKAGE']),
  includes: z.array(z.string()).default([]),
  format: z.enum(['zip', 'tar.gz', 'json']).default('zip'),
});

export default async function exportRoutes(app: FastifyInstance) {
  const prisma = getPrismaClient();
  const ipfsService = new IPFSService();

  // Create a new export
  app.post('/', {
    preHandler: [app.authenticate],
    schema: {
      tags: ['Exports'],
      summary: 'Create a new export bundle',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['vAppId', 'type'],
        properties: {
          vAppId: { type: 'string', format: 'uuid' },
          type: { type: 'string', enum: ['PROOF_BUNDLE', 'SOURCE_CODE', 'METADATA', 'FULL_PACKAGE'] },
          includes: { type: 'array', items: { type: 'string' } },
          format: { type: 'string', enum: ['zip', 'tar.gz', 'json'], default: 'zip' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            vAppId: { type: 'string' },
            type: { type: 'string' },
            format: { type: 'string' },
            contentHash: { type: 'string' },
            size: { type: 'string' },
            includes: { type: 'array', items: { type: 'string' } },
            version: { type: 'string' },
            downloadUrl: { type: 'string' },
            createdAt: { type: 'string' },
            expiresAt: { type: 'string', nullable: true },
          },
        },
      },
    },
  }, async (request, reply) => {
    const body = createExportSchema.parse(request.body);
    const userId = (request as any).user.userId;

    // Check if vApp exists and user has access
    const vApp = await prisma.vApp.findUnique({
      where: { id: body.vAppId },
      select: {
        id: true,
        name: true,
        version: true,
        visibility: true,
        authorId: true,
      },
    });

    if (!vApp) {
      return reply.code(404).send({ error: 'VApp not found' });
    }

    // Check access permissions
    if (vApp.visibility === 'PRIVATE' && vApp.authorId !== userId) {
      return reply.code(403).send({ error: 'Access denied' });
    }

    try {
      // Generate export bundle
      const exportData = await generateExportBundle(vApp, body.type, body.includes);
      
      // Upload to IPFS
      const contentHash = await ipfsService.uploadJSON(exportData, `export-${body.type.toLowerCase()}.json`);
      
      // Calculate size
      const size = Buffer.byteLength(JSON.stringify(exportData), 'utf8');

      // Set expiration (30 days from now)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      const exportRecord = await prisma.export.create({
        data: {
          vAppId: body.vAppId,
          type: body.type as ExportType,
          format: body.format,
          contentHash,
          size: BigInt(size),
          includes: body.includes,
          version: vApp.version,
          expiresAt,
        },
        select: {
          id: true,
          vAppId: true,
          type: true,
          format: true,
          contentHash: true,
          size: true,
          includes: true,
          version: true,
          createdAt: true,
          expiresAt: true,
        },
      });

      const downloadUrl = ipfsService.getGatewayUrl(contentHash);

      return reply.code(201).send({
        ...exportRecord,
        size: exportRecord.size.toString(),
        downloadUrl,
      });

    } catch (error) {
      app.log.error('Export creation failed:', error);
      return reply.code(500).send({ error: 'Failed to create export' });
    }
  });

  // Get all exports with filtering
  app.get('/', {
    schema: {
      tags: ['Exports'],
      summary: 'List export bundles',
      querystring: {
        type: 'object',
        properties: {
          vAppId: { type: 'string', format: 'uuid' },
          type: { type: 'string', enum: ['PROOF_BUNDLE', 'SOURCE_CODE', 'METADATA', 'FULL_PACKAGE'] },
          format: { type: 'string', enum: ['zip', 'tar.gz', 'json'] },
          page: { type: 'number', minimum: 1, default: 1 },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
          sortBy: { type: 'string', enum: ['createdAt', 'size', 'type'], default: 'createdAt' },
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
                  format: { type: 'string' },
                  contentHash: { type: 'string' },
                  size: { type: 'string' },
                  includes: { type: 'array', items: { type: 'string' } },
                  version: { type: 'string' },
                  downloadUrl: { type: 'string' },
                  vApp: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                    },
                  },
                  createdAt: { type: 'string' },
                  expiresAt: { type: 'string', nullable: true },
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
      type,
      format,
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

    if (type) {
      where.type = type as ExportType;
    }

    if (format) {
      where.format = format;
    }

    // Only show exports for public vApps or user's own vApps
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

    // Filter out expired exports
    where.OR = [
      { expiresAt: null },
      { expiresAt: { gt: new Date() } },
    ];

    // Get total count
    const total = await prisma.export.count({ where });

    // Get exports
    const exports = await prisma.export.findMany({
      where,
      select: {
        id: true,
        type: true,
        format: true,
        contentHash: true,
        size: true,
        includes: true,
        version: true,
        createdAt: true,
        expiresAt: true,
        vApp: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { [sortBy]: sortOrder },
      skip: offset,
      take: limit,
    });

    return {
      data: exports.map(exp => ({
        ...exp,
        size: exp.size.toString(),
        downloadUrl: ipfsService.getGatewayUrl(exp.contentHash),
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  });

  // Get a specific export by ID
  app.get('/:id', {
    schema: {
      tags: ['Exports'],
      summary: 'Get an export bundle by ID',
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
            format: { type: 'string' },
            contentHash: { type: 'string' },
            size: { type: 'string' },
            includes: { type: 'array', items: { type: 'string' } },
            version: { type: 'string' },
            downloadUrl: { type: 'string' },
            vApp: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                version: { type: 'string' },
              },
            },
            createdAt: { type: 'string' },
            expiresAt: { type: 'string', nullable: true },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const exportRecord = await prisma.export.findUnique({
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
      },
    });

    if (!exportRecord) {
      return reply.code(404).send({ error: 'Export not found' });
    }

    // Check if export has expired
    if (exportRecord.expiresAt && exportRecord.expiresAt < new Date()) {
      return reply.code(410).send({ error: 'Export has expired' });
    }

    // Check visibility permissions
    if (exportRecord.vApp.visibility === 'PRIVATE') {
      const userId = (request as any).user?.userId;
      if (!userId || userId !== exportRecord.vApp.authorId) {
        return reply.code(404).send({ error: 'Export not found' });
      }
    }

    return {
      ...exportRecord,
      size: exportRecord.size.toString(),
      downloadUrl: ipfsService.getGatewayUrl(exportRecord.contentHash),
    };
  });

  // Download export content
  app.get('/:id/download', {
    schema: {
      tags: ['Exports'],
      summary: 'Download export bundle content',
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
          description: 'Export bundle content',
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const exportRecord = await prisma.export.findUnique({
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

    if (!exportRecord) {
      return reply.code(404).send({ error: 'Export not found' });
    }

    // Check if export has expired
    if (exportRecord.expiresAt && exportRecord.expiresAt < new Date()) {
      return reply.code(410).send({ error: 'Export has expired' });
    }

    // Check visibility permissions
    if (exportRecord.vApp.visibility === 'PRIVATE') {
      const userId = (request as any).user?.userId;
      if (!userId || userId !== exportRecord.vApp.authorId) {
        return reply.code(404).send({ error: 'Export not found' });
      }
    }

    try {
      // Download content from IPFS
      const content = await ipfsService.downloadJSON(exportRecord.contentHash);
      
      // Set appropriate headers
      reply.header('Content-Type', 'application/json');
      reply.header('Content-Disposition', `attachment; filename="export-${exportRecord.type.toLowerCase()}.json"`);
      
      return content;

    } catch (error) {
      app.log.error('Export download failed:', error);
      return reply.code(500).send({ error: 'Failed to download export' });
    }
  });

  // Delete an export
  app.delete('/:id', {
    preHandler: [app.authenticate],
    schema: {
      tags: ['Exports'],
      summary: 'Delete an export bundle',
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

    // Check if export exists and user owns the vApp
    const exportRecord = await prisma.export.findUnique({
      where: { id },
      include: {
        vApp: {
          select: {
            authorId: true,
          },
        },
      },
    });

    if (!exportRecord) {
      return reply.code(404).send({ error: 'Export not found' });
    }

    if (exportRecord.vApp.authorId !== userId) {
      return reply.code(403).send({ error: 'Not authorized to delete this export' });
    }

    await prisma.export.delete({
      where: { id },
    });

    return reply.code(204).send();
  });

  // Get export statistics
  app.get('/stats/overview', {
    schema: {
      tags: ['Exports'],
      summary: 'Get export statistics overview',
      response: {
        200: {
          type: 'object',
          properties: {
            totalExports: { type: 'number' },
            exportsByType: {
              type: 'object',
              properties: {
                PROOF_BUNDLE: { type: 'number' },
                SOURCE_CODE: { type: 'number' },
                METADATA: { type: 'number' },
                FULL_PACKAGE: { type: 'number' },
              },
            },
            exportsByFormat: {
              type: 'object',
              properties: {
                zip: { type: 'number' },
                'tar.gz': { type: 'number' },
                json: { type: 'number' },
              },
            },
            totalSize: { type: 'string' },
            averageSize: { type: 'string' },
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
    // Get total exports
    const totalExports = await prisma.export.count();

    // Get exports by type
    const typeStats = await prisma.export.groupBy({
      by: ['type'],
      _count: { type: true },
    });

    const exportsByType = {
      PROOF_BUNDLE: 0,
      SOURCE_CODE: 0,
      METADATA: 0,
      FULL_PACKAGE: 0,
    };

    typeStats.forEach(item => {
      exportsByType[item.type] = item._count.type;
    });

    // Get exports by format
    const formatStats = await prisma.export.groupBy({
      by: ['format'],
      _count: { format: true },
    });

    const exportsByFormat: Record<string, number> = {};
    formatStats.forEach(item => {
      exportsByFormat[item.format] = item._count.format;
    });

    // Get size statistics
    const sizeStats = await prisma.export.aggregate({
      _sum: { size: true },
      _avg: { size: true },
    });

    const totalSize = sizeStats._sum.size?.toString() || '0';
    const averageSize = sizeStats._avg.size?.toFixed(0) || '0';

    // Get recent activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentActivity = await prisma.export.groupBy({
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
      totalExports,
      exportsByType,
      exportsByFormat,
      totalSize,
      averageSize,
      recentActivity: formattedActivity,
    };
  });

  // Helper function to generate export bundle
  async function generateExportBundle(vApp: any, type: ExportType, includes: string[]): Promise<any> {
    const bundle: any = {
      metadata: {
        vAppId: vApp.id,
        vAppName: vApp.name,
        version: vApp.version,
        exportType: type,
        exportedAt: new Date().toISOString(),
        includes,
      },
    };

    switch (type) {
      case 'PROOF_BUNDLE':
        bundle.proofs = await getProofData(vApp.id);
        break;
      
      case 'SOURCE_CODE':
        bundle.sourceCode = await getSourceCodeData(vApp.id);
        break;
      
      case 'METADATA':
        bundle.vappMetadata = await getVAppMetadata(vApp.id);
        break;
      
      case 'FULL_PACKAGE':
        bundle.proofs = await getProofData(vApp.id);
        bundle.sourceCode = await getSourceCodeData(vApp.id);
        bundle.vappMetadata = await getVAppMetadata(vApp.id);
        bundle.submissions = await getSubmissionData(vApp.id);
        bundle.verificationLogs = await getVerificationLogs(vApp.id);
        break;
    }

    return bundle;
  }

  async function getProofData(vAppId: string): Promise<any[]> {
    const proofs = await prisma.proof.findMany({
      where: { vAppId },
      select: {
        id: true,
        type: true,
        circuitHash: true,
        proofData: true,
        publicInputs: true,
        verifierKey: true,
        isValid: true,
        verifiedAt: true,
        createdAt: true,
      },
    });

    return proofs;
  }

  async function getSourceCodeData(vAppId: string): Promise<any[]> {
    const submissions = await prisma.submission.findMany({
      where: { vAppId },
      select: {
        id: true,
        sourceHash: true,
        commitHash: true,
        branch: true,
        createdAt: true,
      },
    });

    return submissions;
  }

  async function getVAppMetadata(vAppId: string): Promise<any> {
    const vApp = await prisma.vApp.findUnique({
      where: { id: vAppId },
      select: {
        metadata: true,
        tags: true,
        category: true,
        repoUrl: true,
      },
    });

    return vApp;
  }

  async function getSubmissionData(vAppId: string): Promise<any[]> {
    const submissions = await prisma.submission.findMany({
      where: { vAppId },
      select: {
        id: true,
        type: true,
        status: true,
        sourceHash: true,
        proofHash: true,
        metadataHash: true,
        verifiedAt: true,
        createdAt: true,
      },
    });

    return submissions;
  }

  async function getVerificationLogs(vAppId: string): Promise<any[]> {
    const logs = await prisma.verificationLog.findMany({
      where: {
        submission: {
          vAppId,
        },
      },
      select: {
        level: true,
        message: true,
        details: true,
        verifierNode: true,
        chainId: true,
        txHash: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100, // Limit to last 100 logs
    });

    return logs;
  }
}
