import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { getRedisClient } from '@/services/redis';
import { getPrismaClient } from '@/database/connection';
import { logger } from '@/utils/logger';
import {
  ApiUsageMetrics,
  UsageTrackingContext,
  BillingMiddlewareOptions,
  InsufficientCreditsError,
} from '@/types/billing';
import { CreditManagementService } from '@/services/credit-management';
import { UsageProcessorService } from '@/services/usage-processor';
import { Decimal } from '@prisma/client/runtime/library';

export class UsageTrackingMiddleware {
  private redis = getRedisClient();
  private prisma = getPrismaClient();
  private creditService = new CreditManagementService();
  private usageProcessor = new UsageProcessorService();

  constructor(private options: BillingMiddlewareOptions) {}

  /**
   * Fastify plugin for usage tracking
   */
  static async register(
    app: FastifyInstance,
    options: BillingMiddlewareOptions
  ): Promise<void> {
    const middleware = new UsageTrackingMiddleware(options);

    // Add pre-handler hook to start tracking
    app.addHook('preHandler', async (request, reply) => {
      await middleware.preHandler(request, reply);
    });

    // Add post-response hook to complete tracking
    app.addHook('onResponse', async (request, reply) => {
      await middleware.postHandler(request, reply);
    });

    // Add error handler for billing errors
    app.setErrorHandler(async (error, request, reply) => {
      if (error instanceof InsufficientCreditsError) {
        return reply.code(402).send({
          error: 'Payment Required',
          message: error.message,
          required: error.required.toString(),
          available: error.available.toString(),
          code: 'INSUFFICIENT_CREDITS',
        });
      }
      throw error;
    });
  }

  /**
   * Pre-handler: Initialize tracking context and check credits
   */
  private async preHandler(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      // Skip tracking for excluded endpoints
      if (this.shouldSkipEndpoint(request.url)) {
        return;
      }

      // Initialize tracking context
      const context: UsageTrackingContext = {
        startTime: new Date(),
        skipBilling: false,
      };

      // Extract user identity
      const identity = await this.extractUserIdentity(request);
      context.userId = identity.userId;
      context.apiKeyId = identity.apiKeyId;

      // Determine pricing tier
      context.pricingTier = await this.determinePricingTier(
        identity.userId,
        identity.apiKeyId
      );

      // Store context in request
      (request as any).usageContext = context;

      // Pre-check credits if real-time deduction is enabled
      if (this.options.enableRealTimeDeduction && identity.userId) {
        await this.preCheckCredits(request, identity.userId, context.pricingTier);
      }
    } catch (error) {
      logger.error('Usage tracking pre-handler error:', error);
      // Don't block the request for tracking errors
      (request as any).usageContext = { startTime: new Date(), skipBilling: true };
    }
  }

  /**
   * Post-handler: Log usage and deduct credits
   */
  private async postHandler(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const context = (request as any).usageContext as UsageTrackingContext;
    if (!context || context.skipBilling) {
      return;
    }

    try {
      // Calculate metrics
      const metrics = await this.calculateUsageMetrics(request, reply, context);

      // Log usage asynchronously to Redis
      this.logUsageAsync(metrics);

      // Deduct credits if real-time mode is enabled
      if (this.options.enableRealTimeDeduction && metrics.userId && metrics.creditsCost) {
        await this.deductCredits(metrics.userId, metrics.creditsCost, metrics);
      }
    } catch (error) {
      logger.error('Usage tracking post-handler error:', error);
      // Don't affect the response
    }
  }

  /**
   * Extract user identity from request
   */
  private async extractUserIdentity(request: FastifyRequest): Promise<{
    userId?: string;
    apiKeyId?: string;
  }> {
    let userId: string | undefined;
    let apiKeyId: string | undefined;

    // Check for JWT token
    try {
      const user = (request as any).user;
      if (user?.id) {
        userId = user.id;
      }
    } catch {
      // JWT not present or invalid
    }

    // Check for API key
    const apiKey = request.headers['x-api-key'] as string;
    if (apiKey) {
      try {
        const keyRecord = await this.prisma.aPIKey.findUnique({
          where: { keyHash: apiKey },
          select: { id: true, userId: true, isActive: true },
        });

        if (keyRecord?.isActive) {
          apiKeyId = keyRecord.id;
          userId = keyRecord.userId;
        }
      } catch (error) {
        logger.warn('Failed to validate API key:', error);
      }
    }

    return { userId, apiKeyId };
  }

  /**
   * Determine pricing tier for user
   */
  private async determinePricingTier(
    userId?: string,
    apiKeyId?: string
  ): Promise<string> {
    // TODO: Implement user-specific pricing tier logic
    // For now, return default tier
    return this.options.defaultPricingTier;
  }

  /**
   * Pre-check if user has sufficient credits
   */
  private async preCheckCredits(
    request: FastifyRequest,
    userId: string,
    pricingTier: string
  ): Promise<void> {
    // Estimate cost based on request
    const estimatedCost = await this.estimateRequestCost(request, pricingTier);
    
    if (estimatedCost.gt(0)) {
      const balance = await this.creditService.getBalance(userId);
      if (balance.balance.lt(estimatedCost)) {
        throw new InsufficientCreditsError(estimatedCost, balance.balance, userId);
      }
    }
  }

  /**
   * Estimate request cost before processing
   */
  private async estimateRequestCost(
    request: FastifyRequest,
    pricingTier: string
  ): Promise<Decimal> {
    try {
      const requestSize = this.getRequestSize(request);
      const endpoint = this.normalizeEndpoint(request.url);
      
      return await this.usageProcessor.estimateCost({
        endpoint,
        requestSize,
        estimatedDuration: 1000, // Default estimate
        pricingTier,
      });
    } catch (error) {
      logger.warn('Failed to estimate request cost:', error);
      return new Decimal(0);
    }
  }

  /**
   * Calculate complete usage metrics
   */
  private async calculateUsageMetrics(
    request: FastifyRequest,
    reply: FastifyReply,
    context: UsageTrackingContext
  ): Promise<ApiUsageMetrics> {
    const endTime = new Date();
    const duration = endTime.getTime() - context.startTime.getTime();
    const requestSize = this.getRequestSize(request);
    const responseSize = this.getResponseSize(reply);
    const endpoint = this.normalizeEndpoint(request.url);
    const success = reply.statusCode < 400;

    // Calculate cost
    let creditsCost: Decimal | undefined;
    if (context.pricingTier) {
      try {
        creditsCost = await this.usageProcessor.calculateCost({
          endpoint,
          requestSize,
          responseSize,
          duration,
          pricingTier: context.pricingTier,
        });
      } catch (error) {
        logger.warn('Failed to calculate usage cost:', error);
      }
    }

    return {
      userId: context.userId,
      apiKeyId: context.apiKeyId,
      userAgent: request.headers['user-agent'],
      ipAddress: this.getClientIP(request),
      method: request.method,
      endpoint,
      fullPath: request.url,
      requestSize,
      responseSize,
      startTime: context.startTime,
      endTime,
      duration,
      statusCode: reply.statusCode,
      success,
      errorMessage: success ? undefined : this.extractErrorMessage(reply),
      creditsCost,
      pricingTier: context.pricingTier,
      metadata: {
        route: request.routerPath,
        params: request.params,
        query: request.query,
      },
    };
  }

  /**
   * Log usage metrics asynchronously to Redis
   */
  private logUsageAsync(metrics: ApiUsageMetrics): void {
    // Use fire-and-forget pattern for performance
    setImmediate(async () => {
      try {
        const logKey = `usage:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
        await this.redis.setex(logKey, 3600, JSON.stringify(metrics)); // 1 hour TTL
        
        // Add to processing queue
        await this.redis.lpush('usage:queue', logKey);
        
        logger.debug('Usage logged to Redis:', { key: logKey, endpoint: metrics.endpoint });
      } catch (error) {
        logger.error('Failed to log usage to Redis:', error);
      }
    });
  }

  /**
   * Deduct credits from user account
   */
  private async deductCredits(
    userId: string,
    amount: Decimal,
    metrics: ApiUsageMetrics
  ): Promise<void> {
    try {
      await this.creditService.deductCredits(userId, amount, {
        type: 'USAGE',
        description: `API call: ${metrics.method} ${metrics.endpoint}`,
        reference: `${metrics.startTime.getTime()}`,
        metadata: {
          endpoint: metrics.endpoint,
          duration: metrics.duration,
          statusCode: metrics.statusCode,
        },
      });
    } catch (error) {
      logger.error('Failed to deduct credits:', error);
      // In production, you might want to handle this more gracefully
      // e.g., queue for retry, send alerts, etc.
    }
  }

  /**
   * Utility methods
   */
  private shouldSkipEndpoint(url: string): boolean {
    return this.options.skipEndpoints.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(url);
      }
      return url.startsWith(pattern);
    });
  }

  private getRequestSize(request: FastifyRequest): number {
    const contentLength = request.headers['content-length'];
    if (contentLength) {
      return parseInt(contentLength, 10);
    }
    
    // Estimate from body if available
    if (request.body) {
      return JSON.stringify(request.body).length;
    }
    
    return 0;
  }

  private getResponseSize(reply: FastifyReply): number {
    const contentLength = reply.getHeader('content-length');
    if (contentLength) {
      return parseInt(contentLength.toString(), 10);
    }
    
    // Estimate from payload if available
    const payload = (reply as any).payload;
    if (payload) {
      return typeof payload === 'string' ? payload.length : JSON.stringify(payload).length;
    }
    
    return 0;
  }

  private normalizeEndpoint(url: string): string {
    // Remove query parameters and normalize path
    const path = url.split('?')[0];
    
    // Replace dynamic segments with placeholders
    return path
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
      .replace(/\/\d+/g, '/:id')
      .replace(/\/[a-zA-Z0-9_-]{20,}/g, '/:hash');
  }

  private getClientIP(request: FastifyRequest): string {
    return (
      (request.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      (request.headers['x-real-ip'] as string) ||
      request.ip ||
      'unknown'
    );
  }

  private extractErrorMessage(reply: FastifyReply): string | undefined {
    const payload = (reply as any).payload;
    if (payload && typeof payload === 'object' && payload.message) {
      return payload.message;
    }
    return `HTTP ${reply.statusCode}`;
  }
}

// Default middleware options
export const defaultUsageTrackingOptions: BillingMiddlewareOptions = {
  enableRealTimeDeduction: true,
  skipEndpoints: [
    '/health',
    '/docs',
    '/api',
    '/favicon.ico',
    '/metrics',
  ],
  defaultPricingTier: 'standard',
  maxRequestSize: 10 * 1024 * 1024, // 10MB
  maxDuration: 300000, // 5 minutes
};
