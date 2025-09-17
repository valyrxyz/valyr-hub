import { getPrismaClient } from '@/database/connection';
import { getRedisClient } from '@/services/redis';
import { logger } from '@/utils/logger';
import {
  ApiUsageMetrics,
  PricingCalculation,
  PricingRule,
  UsageAnalytics,
  UsageFilter,
  PricingTierNotFoundError,
} from '@/types/billing';
import { Decimal } from '@prisma/client/runtime/library';

export class UsageProcessorService {
  private prisma = getPrismaClient();
  private redis = getRedisClient();
  private pricingCache = new Map<string, PricingRule>();

  /**
   * Process usage logs from Redis queue
   */
  async processUsageQueue(): Promise<void> {
    try {
      while (true) {
        // Get next usage log from queue
        const logKey = await this.redis.brpop('usage:queue', 10); // 10 second timeout
        
        if (!logKey) {
          continue; // Timeout, continue polling
        }

        const [, key] = logKey;
        
        try {
          // Get usage data from Redis
          const usageData = await this.redis.get(key);
          if (!usageData) {
            logger.warn('Usage data not found for key:', key);
            continue;
          }

          const metrics: ApiUsageMetrics = JSON.parse(usageData);
          
          // Process the usage log
          await this.processUsageLog(metrics);
          
          // Clean up Redis key
          await this.redis.del(key);
          
          logger.debug('Processed usage log:', { key, endpoint: metrics.endpoint });
        } catch (error) {
          logger.error('Failed to process usage log:', { key, error });
          // TODO: Add to dead letter queue for retry
        }
      }
    } catch (error) {
      logger.error('Usage queue processing error:', error);
      // Restart processing after delay
      setTimeout(() => this.processUsageQueue(), 5000);
    }
  }

  /**
   * Process individual usage log
   */
  async processUsageLog(metrics: ApiUsageMetrics): Promise<void> {
    try {
      // Store in database
      await this.prisma.apiUsageLog.create({
        data: {
          userId: metrics.userId,
          apiKeyId: metrics.apiKeyId,
          userAgent: metrics.userAgent,
          ipAddress: metrics.ipAddress,
          method: metrics.method,
          endpoint: metrics.endpoint,
          fullPath: metrics.fullPath,
          requestSize: metrics.requestSize,
          responseSize: metrics.responseSize,
          startTime: metrics.startTime,
          endTime: metrics.endTime,
          duration: metrics.duration,
          statusCode: metrics.statusCode,
          success: metrics.success,
          errorMessage: metrics.errorMessage,
          creditsCost: metrics.creditsCost,
          pricingTier: metrics.pricingTier,
          metadata: metrics.metadata,
        },
      });

      // Update usage statistics in Redis
      await this.updateUsageStats(metrics);
      
    } catch (error) {
      logger.error('Failed to process usage log:', error);
      throw error;
    }
  }

  /**
   * Calculate cost for API usage
   */
  async calculateCost(params: {
    endpoint: string;
    requestSize: number;
    responseSize: number;
    duration: number;
    pricingTier: string;
  }): Promise<Decimal> {
    try {
      const pricing = await this.getPricingRule(params.pricingTier);
      const calculation = this.performPricingCalculation(params, pricing);
      return calculation.totalPrice;
    } catch (error) {
      logger.error('Failed to calculate cost:', error);
      throw error;
    }
  }

  /**
   * Estimate cost before processing (for pre-checks)
   */
  async estimateCost(params: {
    endpoint: string;
    requestSize: number;
    estimatedDuration: number;
    pricingTier: string;
  }): Promise<Decimal> {
    try {
      const pricing = await this.getPricingRule(params.pricingTier);
      
      // Use conservative estimates for response size
      const estimatedResponseSize = Math.max(params.requestSize, 1024); // At least 1KB
      
      const calculation = this.performPricingCalculation({
        ...params,
        responseSize: estimatedResponseSize,
        duration: params.estimatedDuration,
      }, pricing);
      
      return calculation.totalPrice;
    } catch (error) {
      logger.error('Failed to estimate cost:', error);
      return new Decimal(0); // Return 0 on error to avoid blocking requests
    }
  }

  /**
   * Get detailed pricing calculation breakdown
   */
  async getPricingCalculation(params: {
    endpoint: string;
    requestSize: number;
    responseSize: number;
    duration: number;
    pricingTier: string;
  }): Promise<PricingCalculation> {
    try {
      const pricing = await this.getPricingRule(params.pricingTier);
      return this.performPricingCalculation(params, pricing);
    } catch (error) {
      logger.error('Failed to get pricing calculation:', error);
      throw error;
    }
  }

  /**
   * Get usage analytics for user
   */
  async getUserUsageAnalytics(
    userId: string,
    filter: UsageFilter = {}
  ): Promise<UsageAnalytics> {
    try {
      const where: any = { userId };
      
      if (filter.startDate || filter.endDate) {
        where.createdAt = {};
        if (filter.startDate) where.createdAt.gte = filter.startDate;
        if (filter.endDate) where.createdAt.lte = filter.endDate;
      }
      
      if (filter.endpoint) where.endpoint = filter.endpoint;
      if (filter.method) where.method = filter.method;
      if (filter.success !== undefined) where.success = filter.success;
      if (filter.minDuration) where.duration = { gte: filter.minDuration };
      if (filter.maxDuration) {
        where.duration = { ...where.duration, lte: filter.maxDuration };
      }

      // Get basic stats
      const [totalCalls, totalCreditsUsed, avgResponseTime] = await Promise.all([
        this.prisma.apiUsageLog.count({ where }),
        this.prisma.apiUsageLog.aggregate({
          where,
          _sum: { creditsCost: true },
        }),
        this.prisma.apiUsageLog.aggregate({
          where,
          _avg: { duration: true },
        }),
      ]);

      // Get success rate
      const successfulCalls = await this.prisma.apiUsageLog.count({
        where: { ...where, success: true },
      });
      const successRate = totalCalls > 0 ? (successfulCalls / totalCalls) * 100 : 0;

      // Get top endpoints
      const topEndpoints = await this.prisma.apiUsageLog.groupBy({
        by: ['endpoint'],
        where,
        _count: { endpoint: true },
        _sum: { creditsCost: true },
        _avg: { duration: true },
        orderBy: { _count: { endpoint: 'desc' } },
        take: 10,
      });

      // Get daily usage
      const dailyUsage = await this.getDailyUsage(where);

      // Get error breakdown
      const errorBreakdown = await this.getErrorBreakdown(where);

      return {
        totalCalls,
        totalCreditsUsed: totalCreditsUsed._sum.creditsCost || new Decimal(0),
        averageResponseTime: avgResponseTime._avg.duration || 0,
        successRate,
        topEndpoints: topEndpoints.map(ep => ({
          endpoint: ep.endpoint,
          calls: ep._count.endpoint,
          creditsUsed: ep._sum.creditsCost || new Decimal(0),
          averageResponseTime: ep._avg.duration || 0,
        })),
        dailyUsage,
        errorBreakdown,
      };
    } catch (error) {
      logger.error('Failed to get usage analytics:', error);
      throw error;
    }
  }

  /**
   * Get usage logs with pagination
   */
  async getUsageLogs(
    filter: UsageFilter & { page?: number; limit?: number }
  ) {
    try {
      const { page = 1, limit = 50, ...filterParams } = filter;
      const skip = (page - 1) * limit;

      const where: any = {};
      
      if (filterParams.userId) where.userId = filterParams.userId;
      if (filterParams.apiKeyId) where.apiKeyId = filterParams.apiKeyId;
      if (filterParams.endpoint) where.endpoint = filterParams.endpoint;
      if (filterParams.method) where.method = filterParams.method;
      if (filterParams.success !== undefined) where.success = filterParams.success;
      
      if (filterParams.startDate || filterParams.endDate) {
        where.createdAt = {};
        if (filterParams.startDate) where.createdAt.gte = filterParams.startDate;
        if (filterParams.endDate) where.createdAt.lte = filterParams.endDate;
      }
      
      if (filterParams.minDuration) where.duration = { gte: filterParams.minDuration };
      if (filterParams.maxDuration) {
        where.duration = { ...where.duration, lte: filterParams.maxDuration };
      }

      const [logs, total] = await Promise.all([
        this.prisma.apiUsageLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          include: {
            user: { select: { id: true, username: true, email: true } },
            apiKey: { select: { id: true, name: true } },
          },
        }),
        this.prisma.apiUsageLog.count({ where }),
      ]);

      return {
        logs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      logger.error('Failed to get usage logs:', error);
      throw error;
    }
  }

  /**
   * Private helper methods
   */
  private async getPricingRule(tierName: string): Promise<PricingRule> {
    // Check cache first
    if (this.pricingCache.has(tierName)) {
      return this.pricingCache.get(tierName)!;
    }

    try {
      const tier = await this.prisma.pricingTier.findUnique({
        where: { name: tierName, isActive: true },
      });

      if (!tier) {
        throw new PricingTierNotFoundError(tierName);
      }

      const rule: PricingRule = {
        basePrice: tier.basePrice,
        sizeMultiplier: tier.sizeMultiplier,
        durationMultiplier: tier.durationMultiplier,
        endpointPricing: tier.endpointPricing as Record<string, number>,
        maxRequestSize: tier.maxRequestSize,
        maxDuration: tier.maxDuration,
      };

      // Cache for 5 minutes
      this.pricingCache.set(tierName, rule);
      setTimeout(() => this.pricingCache.delete(tierName), 5 * 60 * 1000);

      return rule;
    } catch (error) {
      logger.error('Failed to get pricing rule:', error);
      throw error;
    }
  }

  private performPricingCalculation(
    params: {
      endpoint: string;
      requestSize: number;
      responseSize: number;
      duration: number;
    },
    pricing: PricingRule
  ): PricingCalculation {
    // Base price
    const basePrice = pricing.basePrice;

    // Size-based pricing (per KB)
    const totalSize = params.requestSize + params.responseSize;
    const sizeInKB = totalSize / 1024;
    const sizePrice = new Decimal(sizeInKB).mul(pricing.sizeMultiplier);

    // Duration-based pricing (per second)
    const durationInSeconds = params.duration / 1000;
    const durationPrice = new Decimal(durationInSeconds).mul(pricing.durationMultiplier);

    // Endpoint-specific pricing
    let endpointPrice = new Decimal(0);
    if (pricing.endpointPricing && pricing.endpointPricing[params.endpoint]) {
      endpointPrice = new Decimal(pricing.endpointPricing[params.endpoint]);
    }

    // Total price
    const totalPrice = basePrice.add(sizePrice).add(durationPrice).add(endpointPrice);

    return {
      basePrice,
      sizePrice,
      durationPrice,
      endpointPrice,
      totalPrice,
      pricingTier: 'calculated', // This would be set by the caller
    };
  }

  private async updateUsageStats(metrics: ApiUsageMetrics): Promise<void> {
    try {
      const date = metrics.startTime.toISOString().split('T')[0];
      const statsKey = `stats:${metrics.userId}:${date}`;
      
      // Update daily stats in Redis
      const pipeline = this.redis.pipeline();
      pipeline.hincrby(statsKey, 'totalCalls', 1);
      pipeline.hincrby(statsKey, 'totalDuration', metrics.duration);
      pipeline.hincrby(statsKey, 'totalRequestSize', metrics.requestSize);
      pipeline.hincrby(statsKey, 'totalResponseSize', metrics.responseSize);
      
      if (metrics.success) {
        pipeline.hincrby(statsKey, 'successfulCalls', 1);
      } else {
        pipeline.hincrby(statsKey, 'failedCalls', 1);
      }
      
      if (metrics.creditsCost) {
        pipeline.hincrbyfloat(statsKey, 'totalCreditsUsed', parseFloat(metrics.creditsCost.toString()));
      }
      
      // Set expiration (30 days)
      pipeline.expire(statsKey, 30 * 24 * 60 * 60);
      
      await pipeline.exec();
    } catch (error) {
      logger.warn('Failed to update usage stats:', error);
    }
  }

  private async getDailyUsage(where: any): Promise<Array<{
    date: string;
    calls: number;
    creditsUsed: Decimal;
  }>> {
    try {
      // Get last 30 days of usage
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const dailyStats = await this.prisma.apiUsageLog.groupBy({
        by: ['createdAt'],
        where: {
          ...where,
          createdAt: { gte: thirtyDaysAgo },
        },
        _count: { id: true },
        _sum: { creditsCost: true },
      });

      // Group by date
      const dailyUsage = new Map<string, { calls: number; creditsUsed: Decimal }>();
      
      for (const stat of dailyStats) {
        const date = stat.createdAt.toISOString().split('T')[0];
        const existing = dailyUsage.get(date) || { calls: 0, creditsUsed: new Decimal(0) };
        
        dailyUsage.set(date, {
          calls: existing.calls + stat._count.id,
          creditsUsed: existing.creditsUsed.add(stat._sum.creditsCost || 0),
        });
      }

      return Array.from(dailyUsage.entries()).map(([date, data]) => ({
        date,
        calls: data.calls,
        creditsUsed: data.creditsUsed,
      }));
    } catch (error) {
      logger.warn('Failed to get daily usage:', error);
      return [];
    }
  }

  private async getErrorBreakdown(where: any): Promise<Record<number, number>> {
    try {
      const errorStats = await this.prisma.apiUsageLog.groupBy({
        by: ['statusCode'],
        where: {
          ...where,
          success: false,
        },
        _count: { statusCode: true },
      });

      const breakdown: Record<number, number> = {};
      for (const stat of errorStats) {
        breakdown[stat.statusCode] = stat._count.statusCode;
      }

      return breakdown;
    } catch (error) {
      logger.warn('Failed to get error breakdown:', error);
      return {};
    }
  }
}
