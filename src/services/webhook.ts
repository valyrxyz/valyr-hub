import { PrismaClient, WebhookEvent } from '@prisma/client';
import { FastifyInstance } from 'fastify';
import { getPrismaClient } from '@/database/connection';
import { config } from '@/config/environment';
import { generateWebhookSignature } from '@/utils/crypto';
import { logger } from '@/utils/logger';

export class WebhookService {
  private prisma = getPrismaClient();

  /**
   * Send webhook notification for submission processed
   */
  async sendSubmissionProcessed(submission: any, status: string): Promise<void> {
    const event: WebhookEvent = status === 'VERIFIED' ? 'SUBMISSION_PROCESSED' : 'SUBMISSION_PROCESSED';
    
    const payload = {
      event,
      data: {
        submissionId: submission.id,
        vAppId: submission.vAppId,
        status,
        timestamp: new Date().toISOString(),
      },
    };

    await this.sendWebhooks('VAPP_CREATED', payload);
  }

  /**
   * Send webhook notification for vApp created
   */
  async sendVAppCreated(vApp: any): Promise<void> {
    const payload = {
      event: 'VAPP_CREATED' as WebhookEvent,
      data: {
        vAppId: vApp.id,
        name: vApp.name,
        version: vApp.version,
        authorId: vApp.authorId,
        timestamp: new Date().toISOString(),
      },
    };

    await this.sendWebhooks('VAPP_CREATED', payload);
  }

  /**
   * Send webhook notification for vApp verified
   */
  async sendVAppVerified(vApp: any): Promise<void> {
    const payload = {
      event: 'VAPP_VERIFIED' as WebhookEvent,
      data: {
        vAppId: vApp.id,
        name: vApp.name,
        version: vApp.version,
        verifiedAt: new Date().toISOString(),
        timestamp: new Date().toISOString(),
      },
    };

    await this.sendWebhooks('VAPP_VERIFIED', payload);
  }

  /**
   * Send webhook notification for vApp flagged
   */
  async sendVAppFlagged(vApp: any, flag: any): Promise<void> {
    const payload = {
      event: 'VAPP_FLAGGED' as WebhookEvent,
      data: {
        vAppId: vApp.id,
        flagId: flag.id,
        reason: flag.reason,
        flaggerId: flag.flaggerId,
        timestamp: new Date().toISOString(),
      },
    };

    await this.sendWebhooks('VAPP_FLAGGED', payload);
  }

  /**
   * Send webhook notification for proof verified
   */
  async sendProofVerified(proof: any): Promise<void> {
    const payload = {
      event: 'PROOF_VERIFIED' as WebhookEvent,
      data: {
        proofId: proof.id,
        vAppId: proof.vAppId,
        submissionId: proof.submissionId,
        type: proof.type,
        isValid: proof.isValid,
        verifiedAt: proof.verifiedAt,
        timestamp: new Date().toISOString(),
      },
    };

    await this.sendWebhooks('PROOF_VERIFIED', payload);
  }

  /**
   * Send webhook notification for proof failed
   */
  async sendProofFailed(proof: any, error: string): Promise<void> {
    const payload = {
      event: 'PROOF_FAILED' as WebhookEvent,
      data: {
        proofId: proof.id,
        vAppId: proof.vAppId,
        submissionId: proof.submissionId,
        type: proof.type,
        error,
        timestamp: new Date().toISOString(),
      },
    };

    await this.sendWebhooks('PROOF_FAILED', payload);
  }

  /**
   * Send webhooks for a specific event
   */
  private async sendWebhooks(event: WebhookEvent, payload: any): Promise<void> {
    await this.triggerWebhooks(event, payload);
  }

  /**
   * Send individual webhook
   */
  private async sendWebhook(webhook: any, payload: any): Promise<void> {
    try {
      const payloadString = JSON.stringify(payload);
      const signature = generateWebhookSignature(payloadString, webhook.secret);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Valyr-Signature': signature,
        'X-Valyr-Event': payload.event,
        'User-Agent': 'Valyr-Webhook/1.0',
      };

      // Add custom headers if specified
      if (webhook.headers) {
        Object.assign(headers, webhook.headers);
      }

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: payloadString,
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      if (response.ok) {
        // Update success count
        await this.prisma.webhook.update({
          where: { id: webhook.id },
          data: {
            lastTriggered: new Date(),
            successCount: { increment: 1 },
          },
        });

        logger.info(`Webhook sent successfully: ${webhook.url}`);
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

    } catch (error) {
      // Update failure count
      await this.prisma.webhook.update({
        where: { id: webhook.id },
        data: {
          failureCount: { increment: 1 },
          lastTriggered: new Date(),
        },
      });

      logger.error(`Webhook failed for ${webhook.url}:`, error);
    }
  }

  /**
   * Trigger webhooks for an event
   */
  async triggerWebhooks(event: WebhookEvent, payload: any): Promise<void> {
    try {
      // Get all active webhooks that listen to this event
      const webhooks = await this.prisma.webhook.findMany({
        where: {
          isActive: true,
          events: {
            has: event,
          },
        },
      });

      if (webhooks.length === 0) {
        return;
      }

      // Send webhooks in parallel
      const promises = webhooks.map(async (webhook: any) => {
        try {
          const result = await this.sendWebhook(webhook, payload);
          
          // Update success count
          await this.prisma.webhook.update({
            where: { id: webhook.id },
            data: {
              successCount: { increment: 1 },
              lastTriggered: new Date(),
            },
          });
          
          return { success: true, webhookId: webhook.id };
        } catch (error) {
          // Update failure count
          await this.prisma.webhook.update({
            where: { id: webhook.id },
            data: {
              failureCount: { increment: 1 },
              lastTriggered: new Date(),
            },
          });
          
          logger.error('Webhook delivery failed:', {
            webhookId: webhook.id,
            error: error instanceof Error ? error.message : String(error),
          });
          
          return { success: false, webhookId: webhook.id, error };
        }
      });

      await Promise.allSettled(promises);
    } catch (error) {
      logger.error('Failed to trigger webhooks:', error);
    }
  }

  /**
   * Register a new webhook
   */
  async registerWebhook(data: {
    url: string;
    secret: string;
    events: WebhookEvent[];
    description?: string;
    headers?: Record<string, string>;
    userId: string;
  }): Promise<any> {
    const { url, secret, events, description, headers, userId } = data;
    
    const webhook = await this.prisma.webhook.create({
      data: {
        url,
        secret,
        events,
        description: description || null,
        headers: (headers as any) || null,
        user: {
          connect: { id: userId }
        }
      },
    });
    return webhook;
  }

  /**
   * Update webhook configuration
   */
  async updateWebhook(id: string, data: {
    url?: string;
    secret?: string;
    events?: WebhookEvent[];
    description?: string;
    headers?: Record<string, string>;
    isActive?: boolean;
  }): Promise<any> {
    return await this.prisma.webhook.update({
      where: { id },
      data,
    });
  }

  /**
   * Delete webhook
   */
  async deleteWebhook(id: string): Promise<void> {
    await this.prisma.webhook.delete({
      where: { id },
    });
  }

  /**
   * Get webhook statistics
   */
  async getWebhookStats(webhookId: string): Promise<{
    totalRequests: number;
    successRate: number;
    lastTriggered?: Date;
    isActive: boolean;
  }> {
    const webhook = await this.prisma.webhook.findUnique({
      where: { id: webhookId },
    });

    if (!webhook) {
      throw new Error('Webhook not found');
    }

    const totalRequests = webhook.successCount + webhook.failureCount;
    const successRate = totalRequests > 0 ? webhook.successCount / totalRequests : 0;

    return {
      totalRequests,
      successRate,
      ...(webhook.lastTriggered && { lastTriggered: webhook.lastTriggered }),
      isActive: webhook.isActive,
    };
  }

  /**
   * Test webhook endpoint
   */
  async testWebhook(url: string, secret: string): Promise<{ success: boolean; responseTime: number; error?: string }> {
    const startTime = Date.now();

    try {
      const testPayload = {
        event: 'VAPP_CREATED',
        data: {
          test: true,
          timestamp: new Date().toISOString(),
        },
      };

      const payloadString = JSON.stringify(testPayload);
      const signature = generateWebhookSignature(payloadString, secret);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Valyr-Signature': signature,
          'X-Valyr-Event': 'VAPP_CREATED',
          'User-Agent': 'Valyr-Webhook-Test/1.0',
        },
        body: payloadString,
        signal: AbortSignal.timeout(10000), // 10 second timeout for tests
      });

      const responseTime = Date.now() - startTime;

      if (response.ok) {
        return { success: true, responseTime };
      } else {
        return {
          success: false,
          responseTime,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        success: false,
        responseTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get webhooks for a user
   */
  async getUserWebhooks(userId: string): Promise<any[]> {
    const webhooks = await this.prisma.webhook.findMany({
      where: { userId },
    });

    return webhooks.map((webhook: any) => ({
      id: webhook.id,
      url: webhook.url,
      events: webhook.events,
      isActive: webhook.isActive,
      description: webhook.description,
      totalRequests: webhook.successCount + webhook.failureCount,
      successRate: webhook.successCount + webhook.failureCount > 0 
        ? webhook.successCount / (webhook.successCount + webhook.failureCount) 
        : 0,
      lastTriggered: webhook.lastTriggered || undefined,
      createdAt: webhook.createdAt,
    }));
  }
}
