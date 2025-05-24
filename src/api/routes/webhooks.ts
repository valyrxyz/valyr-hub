import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getPrismaClient } from '@/database/connection';
import { WebhookService } from '@/services/webhook';
import { WebhookEvent } from '@prisma/client';

const createWebhookSchema = z.object({
  url: z.string().url(),
  secret: z.string().min(8),
  events: z.array(z.enum([
    'VAPP_CREATED',
    'VAPP_VERIFIED',
    'VAPP_FLAGGED',
    'PROOF_VERIFIED',
    'PROOF_FAILED',
    'SUBMISSION_CREATED',
    'SUBMISSION_PROCESSED'
  ])),
  description: z.string().max(500).optional(),
  headers: z.record(z.string()).optional(),
});

const updateWebhookSchema = z.object({
  url: z.string().url().optional(),
  secret: z.string().min(8).optional(),
  events: z.array(z.enum([
    'VAPP_CREATED',
    'VAPP_VERIFIED',
    'VAPP_FLAGGED',
    'PROOF_VERIFIED',
    'PROOF_FAILED',
    'SUBMISSION_CREATED',
    'SUBMISSION_PROCESSED'
  ])).optional(),
  description: z.string().max(500).optional(),
  headers: z.record(z.string()).optional(),
  isActive: z.boolean().optional(),
});

const webhookRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const prisma = getPrismaClient();
  const webhookService = new WebhookService();

  // Create a new webhook
  app.post('/', {
    preHandler: [app.authenticate],
    schema: {
      tags: ['Webhooks'],
      summary: 'Create a new webhook',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['url', 'secret', 'events'],
        properties: {
          url: { type: 'string', format: 'uri' },
          secret: { type: 'string', minLength: 8 },
          events: {
            type: 'array',
            items: {
              type: 'string',
              enum: [
                'VAPP_CREATED',
                'VAPP_VERIFIED',
                'VAPP_FLAGGED',
                'PROOF_VERIFIED',
                'PROOF_FAILED',
                'SUBMISSION_CREATED',
                'SUBMISSION_PROCESSED'
              ]
            }
          },
          description: { type: 'string', maxLength: 500 },
          headers: { type: 'object', additionalProperties: { type: 'string' } },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            url: { type: 'string' },
            events: { type: 'array', items: { type: 'string' } },
            description: { type: 'string', nullable: true },
            isActive: { type: 'boolean' },
            createdAt: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const body = createWebhookSchema.parse(request.body);
    const userId = (request as any).user?.id || 'anonymous';

    try {
      const webhook = await webhookService.registerWebhook({
        url: body.url,
        secret: body.secret,
        events: body.events,
        ...(body.description && { description: body.description }),
        ...(body.headers && { headers: body.headers }),
        userId,
      });

      return reply.code(201).send({
        id: webhook.id,
        url: webhook.url,
        events: webhook.events,
        description: webhook.description,
        isActive: webhook.isActive,
        createdAt: webhook.createdAt,
      });

    } catch (error: any) {
      app.log.error('Webhook creation failed:', error);
      return reply.code(500).send({ 
        error: 'Failed to create webhook',
        details: error?.message || 'Unknown error'
      });
    }
  });

  // Get all webhooks
  app.get('/', {
    preHandler: [app.authenticate],
    schema: {
      tags: ['Webhooks'],
      summary: 'List webhooks',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          isActive: { type: 'boolean' },
          event: {
            type: 'string',
            enum: [
              'VAPP_CREATED',
              'VAPP_VERIFIED',
              'VAPP_FLAGGED',
              'PROOF_VERIFIED',
              'PROOF_FAILED',
              'SUBMISSION_CREATED',
              'SUBMISSION_PROCESSED'
            ]
          },
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
                  url: { type: 'string' },
                  events: { type: 'array', items: { type: 'string' } },
                  description: { type: 'string', nullable: true },
                  isActive: { type: 'boolean' },
                  lastTriggered: { type: 'string', nullable: true },
                  successCount: { type: 'number' },
                  failureCount: { type: 'number' },
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
    const { isActive, event, page = 1, limit = 20 } = request.query as any;

    const offset = (page - 1) * limit;
    const where: any = {};

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (event) {
      where.events = { has: event };
    }

    // Get total count
    const total = await prisma.webhook.count({ where });

    // Get webhooks
    const webhooks = await prisma.webhook.findMany({
      where,
      select: {
        id: true,
        url: true,
        events: true,
        description: true,
        isActive: true,
        lastTriggered: true,
        successCount: true,
        failureCount: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    });

    return {
      data: webhooks,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  });

  // Get a specific webhook by ID
  app.get('/:id', {
    preHandler: [app.authenticate],
    schema: {
      tags: ['Webhooks'],
      summary: 'Get a webhook by ID',
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
            id: { type: 'string' },
            url: { type: 'string' },
            events: { type: 'array', items: { type: 'string' } },
            description: { type: 'string', nullable: true },
            headers: { type: 'object', nullable: true },
            isActive: { type: 'boolean' },
            lastTriggered: { type: 'string', nullable: true },
            successCount: { type: 'number' },
            failureCount: { type: 'number' },
            createdAt: { type: 'string' },
            updatedAt: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const webhook = await prisma.webhook.findUnique({
      where: { id },
      select: {
        id: true,
        url: true,
        events: true,
        description: true,
        headers: true,
        isActive: true,
        lastTriggered: true,
        successCount: true,
        failureCount: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!webhook) {
      return reply.code(404).send({ error: 'Webhook not found' });
    }

    return webhook;
  });

  // Update a webhook
  app.put('/:id', {
    preHandler: [app.authenticate],
    schema: {
      tags: ['Webhooks'],
      summary: 'Update a webhook',
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
          url: { type: 'string', format: 'uri' },
          secret: { type: 'string', minLength: 8 },
          events: {
            type: 'array',
            items: {
              type: 'string',
              enum: [
                'VAPP_CREATED',
                'VAPP_VERIFIED',
                'VAPP_FLAGGED',
                'PROOF_VERIFIED',
                'PROOF_FAILED',
                'SUBMISSION_CREATED',
                'SUBMISSION_PROCESSED'
              ]
            }
          },
          description: { type: 'string', maxLength: 500 },
          headers: { type: 'object', additionalProperties: { type: 'string' } },
          isActive: { type: 'boolean' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            url: { type: 'string' },
            events: { type: 'array', items: { type: 'string' } },
            description: { type: 'string', nullable: true },
            isActive: { type: 'boolean' },
            updatedAt: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateWebhookSchema.parse(request.body);

    // Check if webhook exists
    const existingWebhook = await prisma.webhook.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existingWebhook) {
      return reply.code(404).send({ error: 'Webhook not found' });
    }

    try {
      const webhook = await webhookService.updateWebhook(id, {
        ...(body.url && { url: body.url }),
        ...(body.secret && { secret: body.secret }),
        ...(body.events && { events: body.events }),
        ...(body.description && { description: body.description }),
        ...(body.headers && { headers: body.headers }),
      });

      return {
        id: webhook.id,
        url: webhook.url,
        events: webhook.events,
        description: webhook.description,
        isActive: webhook.isActive,
        updatedAt: webhook.updatedAt,
      };

    } catch (error: any) {
      app.log.error('Webhook update failed:', error);
      return reply.code(500).send({ 
        error: 'Failed to update webhook',
        details: error?.message || 'Unknown error'
      });
    }
  });

  // Delete a webhook
  app.delete('/:id', {
    preHandler: [app.authenticate],
    schema: {
      tags: ['Webhooks'],
      summary: 'Delete a webhook',
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

    // Check if webhook exists
    const existingWebhook = await prisma.webhook.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existingWebhook) {
      return reply.code(404).send({ error: 'Webhook not found' });
    }

    try {
      await webhookService.deleteWebhook(id);
      return reply.code(204).send();

    } catch (error: any) {
      app.log.error('Webhook deletion failed:', error);
      return reply.code(500).send({ 
        error: 'Failed to delete webhook',
        details: error?.message || 'Unknown error'
      });
    }
  });

  // Test a webhook
  app.post('/:id/test', {
    preHandler: [app.authenticate],
    schema: {
      tags: ['Webhooks'],
      summary: 'Test a webhook endpoint',
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
            success: { type: 'boolean' },
            responseTime: { type: 'number' },
            error: { type: 'string', nullable: true },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    // Get webhook details
    const webhook = await prisma.webhook.findUnique({
      where: { id },
      select: {
        url: true,
        secret: true,
      },
    });

    if (!webhook) {
      return reply.code(404).send({ error: 'Webhook not found' });
    }

    try {
      const result = await webhookService.testWebhook(webhook.url, webhook.secret);
      return result;

    } catch (error: any) {
      app.log.error('Webhook test failed:', error);
      return reply.code(500).send({ error: 'Failed to test webhook' });
    }
  });

  // Get webhook statistics
  app.get('/:id/stats', {
    preHandler: [app.authenticate],
    schema: {
      tags: ['Webhooks'],
      summary: 'Get webhook statistics',
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
            totalRequests: { type: 'number' },
            successRate: { type: 'number' },
            lastTriggered: { type: 'string', nullable: true },
            isActive: { type: 'boolean' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const stats = await webhookService.getWebhookStats(id);
      return stats;

    } catch (error: any) {
      if (error.message === 'Webhook not found') {
        return reply.code(404).send({ error: 'Webhook not found' });
      }
      
      app.log.error('Failed to get webhook stats:', error);
      return reply.code(500).send({ error: 'Failed to get webhook statistics' });
    }
  });

  // Get webhook events overview
  app.get('/events/overview', {
    schema: {
      tags: ['Webhooks'],
      summary: 'Get webhook events overview',
      response: {
        200: {
          type: 'object',
          properties: {
            availableEvents: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  event: { type: 'string' },
                  description: { type: 'string' },
                  examplePayload: { type: 'object' },
                },
              },
            },
            eventStatistics: {
              type: 'object',
              properties: {
                totalWebhooks: { type: 'number' },
                activeWebhooks: { type: 'number' },
                eventSubscriptions: {
                  type: 'object',
                  additionalProperties: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
  }, async () => {
    const availableEvents = [
      {
        event: 'VAPP_CREATED',
        description: 'Triggered when a new vApp is created',
        examplePayload: {
          event: 'VAPP_CREATED',
          data: {
            vAppId: 'uuid',
            name: 'My ZK App',
            version: '1.0.0',
            authorId: 'uuid',
            timestamp: '2024-01-01T00:00:00Z',
          },
        },
      },
      {
        event: 'VAPP_VERIFIED',
        description: 'Triggered when a vApp is successfully verified',
        examplePayload: {
          event: 'VAPP_VERIFIED',
          data: {
            vAppId: 'uuid',
            name: 'My ZK App',
            version: '1.0.0',
            verifiedAt: '2024-01-01T00:00:00Z',
            timestamp: '2024-01-01T00:00:00Z',
          },
        },
      },
      {
        event: 'PROOF_VERIFIED',
        description: 'Triggered when a zero-knowledge proof is verified',
        examplePayload: {
          event: 'PROOF_VERIFIED',
          data: {
            proofId: 'uuid',
            vAppId: 'uuid',
            submissionId: 'uuid',
            type: 'GROTH16',
            isValid: true,
            verifiedAt: '2024-01-01T00:00:00Z',
            timestamp: '2024-01-01T00:00:00Z',
          },
        },
      },
    ];

    // Get webhook statistics
    const totalWebhooks = await prisma.webhook.count();
    const activeWebhooks = await prisma.webhook.count({
      where: { isActive: true },
    });

    // Get event subscription counts
    const webhooks = await prisma.webhook.findMany({
      select: { events: true },
    });

    const eventSubscriptions: Record<string, number> = {};
    webhooks.forEach(webhook => {
      webhook.events.forEach(event => {
        eventSubscriptions[event] = (eventSubscriptions[event] || 0) + 1;
      });
    });

    return {
      availableEvents,
      eventStatistics: {
        totalWebhooks,
        activeWebhooks,
        eventSubscriptions,
      },
    };
  });
};

export default webhookRoutes;
