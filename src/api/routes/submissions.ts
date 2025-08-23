import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getPrismaClient } from '@/database/connection';
import { SubmissionType, SubmissionStatus } from '@prisma/client';
import { IPFSService } from '@/services/ipfs';
import { VerificationService } from '@/services/verification';

const createSubmissionSchema = z.object({
  vAppId: z.string().uuid(),
  type: z.enum(['HOSTED_PACKAGE', 'EXTERNAL_TRACKER']),
  commitHash: z.string().optional(),
  branch: z.string().optional(),
});

const searchSubmissionsSchema = z.object({
  vAppId: z.string().uuid().optional(),
  status: z.enum(['PENDING', 'PROCESSING', 'VERIFIED', 'FAILED', 'FLAGGED']).optional(),
  type: z.enum(['HOSTED_PACKAGE', 'EXTERNAL_TRACKER']).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt', 'updatedAt', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export default async function submissionRoutes(app: FastifyInstance) {
  const prisma = getPrismaClient();
  const ipfsService = new IPFSService();
  const verificationService = new VerificationService();

  // Create a new submission
  app.post('/', {
    preHandler: [app.authenticate],
    schema: {
      tags: ['Submissions'],
      summary: 'Create a new proof submission',
      security: [{ bearerAuth: [] }],
      consumes: ['multipart/form-data'],
      body: {
        type: 'object',
        required: ['vAppId', 'type'],
        properties: {
          vAppId: { type: 'string', format: 'uuid' },
          type: { type: 'string', enum: ['HOSTED_PACKAGE', 'EXTERNAL_TRACKER'] },
          commitHash: { type: 'string' },
          branch: { type: 'string' },
          sourceCode: { type: 'string', format: 'binary' },
          proofFiles: { type: 'string', format: 'binary' },
          metadata: { type: 'string', format: 'binary' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            vAppId: { type: 'string' },
            type: { type: 'string' },
            status: { type: 'string' },
            sourceHash: { type: 'string' },
            proofHash: { type: 'string' },
            metadataHash: { type: 'string' },
            createdAt: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const userId = (request as any).user.userId;
    
    // Parse multipart form data
    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: 'No files uploaded' });
    }

    // Extract form fields
    const fields = data.fields as any;
    const body = createSubmissionSchema.parse({
      vAppId: fields.vAppId?.value,
      type: fields.type?.value,
      commitHash: fields.commitHash?.value,
      branch: fields.branch?.value,
    });

    // Verify user owns the vApp
    const vApp = await prisma.vApp.findUnique({
      where: { id: body.vAppId },
      select: { authorId: true, name: true },
    });

    if (!vApp) {
      return reply.code(404).send({ error: 'VApp not found' });
    }

    if (vApp.authorId !== userId) {
      return reply.code(403).send({ error: 'Not authorized to submit to this vApp' });
    }

    try {
      // Upload files to IPFS
      const chunks: Buffer[] = [];
      for await (const chunk of data.file) {
        chunks.push(chunk);
      }
      const sourceBuffer = Buffer.concat(chunks);
      const sourceHash = await ipfsService.uploadFile(sourceBuffer, 'source.zip');

      // For now, we'll use the same file for proof and metadata
      // In a real implementation, these would be separate files
      const proofHash = await ipfsService.uploadFile(sourceBuffer, 'proof.json');
      const metadataHash = await ipfsService.uploadFile(sourceBuffer, 'metadata.yaml');

      // Create submission record
      const submission = await prisma.submission.create({
        data: {
          vAppId: body.vAppId,
          userId,
          type: body.type as SubmissionType,
          sourceHash,
          proofHash,
          metadataHash,
          commitHash: body.commitHash || null,
          branch: body.branch || null,
          status: 'PENDING',
        },
        select: {
          id: true,
          vAppId: true,
          type: true,
          status: true,
          sourceHash: true,
          proofHash: true,
          metadataHash: true,
          createdAt: true,
        },
      });

      // Trigger verification process asynchronously
      verificationService.startVerification(submission.id).catch((error) => {
        app.log.error('Failed to start verification:', error);
      });

      return reply.code(201).send(submission);
    } catch (error) {
      app.log.error('Submission creation failed:', error);
      return reply.code(500).send({ error: 'Failed to create submission' });
    }
  });

  // Get all submissions with filtering
  app.get('/', {
    schema: {
      tags: ['Submissions'],
      summary: 'List proof submissions',
      querystring: {
        type: 'object',
        properties: {
          vAppId: { type: 'string', format: 'uuid' },
          status: { type: 'string', enum: ['PENDING', 'PROCESSING', 'VERIFIED', 'FAILED', 'FLAGGED'] },
          type: { type: 'string', enum: ['HOSTED_PACKAGE', 'EXTERNAL_TRACKER'] },
          page: { type: 'number', minimum: 1, default: 1 },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
          sortBy: { type: 'string', enum: ['createdAt', 'updatedAt', 'status'], default: 'createdAt' },
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
                  status: { type: 'string' },
                  sourceHash: { type: 'string' },
                  proofHash: { type: 'string' },
                  metadataHash: { type: 'string' },
                  commitHash: { type: 'string', nullable: true },
                  branch: { type: 'string', nullable: true },
                  vApp: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                    },
                  },
                  user: {
                    type: 'object',
                    properties: {
                      username: { type: 'string' },
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
    const query = searchSubmissionsSchema.parse(request.query);
    const offset = (query.page - 1) * query.limit;

    // Build where clause
    const where: any = {};

    if (query.vAppId) {
      where.vAppId = query.vAppId;
    }

    if (query.status) {
      where.status = query.status as SubmissionStatus;
    }

    if (query.type) {
      where.type = query.type as SubmissionType;
    }

    // Only show submissions for public vApps or user's own vApps
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
    const total = await prisma.submission.count({ where });

    // Get submissions
    const submissions = await prisma.submission.findMany({
      where,
      select: {
        id: true,
        type: true,
        status: true,
        sourceHash: true,
        proofHash: true,
        metadataHash: true,
        commitHash: true,
        branch: true,
        createdAt: true,
        updatedAt: true,
        vApp: {
          select: {
            id: true,
            name: true,
          },
        },
        user: {
          select: {
            username: true,
          },
        },
      },
      orderBy: { [query.sortBy]: query.sortOrder },
      skip: offset,
      take: query.limit,
    });

    return {
      data: submissions,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      },
    };
  });

  // Get a specific submission by ID
  app.get('/:id', {
    schema: {
      tags: ['Submissions'],
      summary: 'Get a proof submission by ID',
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
            status: { type: 'string' },
            sourceHash: { type: 'string' },
            proofHash: { type: 'string' },
            metadataHash: { type: 'string' },
            commitHash: { type: 'string', nullable: true },
            branch: { type: 'string', nullable: true },
            verifiedAt: { type: 'string', nullable: true },
            vApp: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                version: { type: 'string' },
              },
            },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                username: { type: 'string' },
              },
            },
            proofs: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  type: { type: 'string' },
                  isValid: { type: 'boolean' },
                  verifiedAt: { type: 'string', nullable: true },
                },
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

    const submission = await prisma.submission.findUnique({
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
        user: {
          select: {
            id: true,
            username: true,
          },
        },
        proofs: {
          select: {
            id: true,
            type: true,
            isValid: true,
            verifiedAt: true,
          },
        },
      },
    });

    if (!submission) {
      return reply.code(404).send({ error: 'Submission not found' });
    }

    // Check visibility permissions
    if (submission.vApp.visibility === 'PRIVATE') {
      const userId = (request as any).user?.userId;
      if (!userId || userId !== submission.vApp.authorId) {
        return reply.code(404).send({ error: 'Submission not found' });
      }
    }

    return submission;
  });

  // Retry verification for a submission
  app.post('/:id/retry', {
    preHandler: [app.authenticate],
    schema: {
      tags: ['Submissions'],
      summary: 'Retry verification for a submission',
      security: [{ bearerAuth: [] }],
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
            message: { type: 'string' },
            submissionId: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = (request as any).user.userId;

    // Check if submission exists and user owns the vApp
    const submission = await prisma.submission.findUnique({
      where: { id },
      include: {
        vApp: {
          select: {
            authorId: true,
          },
        },
      },
    });

    if (!submission) {
      return reply.code(404).send({ error: 'Submission not found' });
    }

    if (submission.vApp.authorId !== userId) {
      return reply.code(403).send({ error: 'Not authorized to retry this submission' });
    }

    if (submission.status === 'PROCESSING') {
      return reply.code(409).send({ error: 'Submission is already being processed' });
    }

    // Reset status and trigger verification
    await prisma.submission.update({
      where: { id },
      data: { status: 'PENDING' },
    });

    // Trigger verification process asynchronously
    verificationService.startVerification(id).catch((error) => {
      app.log.error('Failed to retry verification:', error);
    });

    return {
      message: 'Verification retry initiated',
      submissionId: id,
    };
  });

  // Get submission verification logs
  app.get('/:id/logs', {
    schema: {
      tags: ['Submissions'],
      summary: 'Get verification logs for a submission',
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

    // Check if submission exists and is accessible
    const submission = await prisma.submission.findUnique({
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

    if (!submission) {
      return reply.code(404).send({ error: 'Submission not found' });
    }

    // Check visibility permissions
    if (submission.vApp.visibility === 'PRIVATE') {
      const userId = (request as any).user?.userId;
      if (!userId || userId !== submission.vApp.authorId) {
        return reply.code(404).send({ error: 'Submission not found' });
      }
    }

    const offset = (page - 1) * limit;
    const where: any = { submissionId: id };

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
}
