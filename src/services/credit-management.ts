import { getPrismaClient } from '@/database/connection';
import { getRedisClient } from '@/services/redis';
import { logger } from '@/utils/logger';
import {
  CreditBalance,
  CreditTransactionData,
  CreditTransactionType,
  InsufficientCreditsError,
} from '@/types/billing';
import { Decimal } from '@prisma/client/runtime/library';

export class CreditManagementService {
  private prisma = getPrismaClient();
  private redis = getRedisClient();

  /**
   * Get user's credit balance with caching
   */
  async getBalance(userId: string): Promise<CreditBalance> {
    try {
      // Try to get from cache first
      const cacheKey = `credits:balance:${userId}`;
      const cached = await this.redis.get(cacheKey);
      
      if (cached) {
        const balance = JSON.parse(cached);
        // Convert string decimals back to Decimal objects
        return {
          ...balance,
          balance: new Decimal(balance.balance),
          totalAllocated: new Decimal(balance.totalAllocated),
          totalUsed: new Decimal(balance.totalUsed),
          lowBalanceThreshold: balance.lowBalanceThreshold ? new Decimal(balance.lowBalanceThreshold) : undefined,
          autoTopupAmount: balance.autoTopupAmount ? new Decimal(balance.autoTopupAmount) : undefined,
        };
      }

      // Get from database
      let userCredit = await this.prisma.userCredit.findUnique({
        where: { userId },
      });

      // Create credit account if it doesn't exist
      if (!userCredit) {
        userCredit = await this.createCreditAccount(userId);
      }

      const balance: CreditBalance = {
        balance: userCredit.balance,
        totalAllocated: userCredit.totalAllocated,
        totalUsed: userCredit.totalUsed,
        lowBalanceThreshold: userCredit.lowBalanceThreshold,
        autoTopupEnabled: userCredit.autoTopupEnabled,
        autoTopupAmount: userCredit.autoTopupAmount,
        isActive: userCredit.isActive,
        suspendedAt: userCredit.suspendedAt,
        suspensionReason: userCredit.suspensionReason,
      };

      // Cache for 5 minutes
      await this.redis.setex(cacheKey, 300, JSON.stringify({
        ...balance,
        balance: balance.balance.toString(),
        totalAllocated: balance.totalAllocated.toString(),
        totalUsed: balance.totalUsed.toString(),
        lowBalanceThreshold: balance.lowBalanceThreshold?.toString(),
        autoTopupAmount: balance.autoTopupAmount?.toString(),
      }));

      return balance;
    } catch (error) {
      logger.error('Failed to get credit balance:', error);
      throw error;
    }
  }

  /**
   * Add credits to user account
   */
  async addCredits(
    userId: string,
    amount: Decimal,
    transactionData: Omit<CreditTransactionData, 'amount'>
  ): Promise<CreditBalance> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Get current balance
        let userCredit = await tx.userCredit.findUnique({
          where: { userId },
        });

        if (!userCredit) {
          userCredit = await this.createCreditAccount(userId, tx);
        }

        const balanceBefore = userCredit.balance;
        const balanceAfter = balanceBefore.add(amount);

        // Update balance
        const updatedCredit = await tx.userCredit.update({
          where: { userId },
          data: {
            balance: balanceAfter,
            totalAllocated: userCredit.totalAllocated.add(amount),
            updatedAt: new Date(),
          },
        });

        // Record transaction
        await tx.creditTransaction.create({
          data: {
            userCreditId: updatedCredit.id,
            type: transactionData.type,
            amount,
            balanceBefore,
            balanceAfter,
            description: transactionData.description,
            reference: transactionData.reference,
            metadata: transactionData.metadata,
            processedBy: transactionData.processedBy,
          },
        });

        // Clear cache
        await this.clearBalanceCache(userId);

        logger.info('Credits added successfully:', {
          userId,
          amount: amount.toString(),
          balanceAfter: balanceAfter.toString(),
          type: transactionData.type,
        });

        return {
          balance: updatedCredit.balance,
          totalAllocated: updatedCredit.totalAllocated,
          totalUsed: updatedCredit.totalUsed,
          lowBalanceThreshold: updatedCredit.lowBalanceThreshold,
          autoTopupEnabled: updatedCredit.autoTopupEnabled,
          autoTopupAmount: updatedCredit.autoTopupAmount,
          isActive: updatedCredit.isActive,
          suspendedAt: updatedCredit.suspendedAt,
          suspensionReason: updatedCredit.suspensionReason,
        };
      });
    } catch (error) {
      logger.error('Failed to add credits:', error);
      throw error;
    }
  }

  /**
   * Deduct credits from user account
   */
  async deductCredits(
    userId: string,
    amount: Decimal,
    transactionData: Omit<CreditTransactionData, 'amount'>
  ): Promise<CreditBalance> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Get current balance with row lock
        const userCredit = await tx.userCredit.findUnique({
          where: { userId },
        });

        if (!userCredit) {
          throw new Error(`Credit account not found for user: ${userId}`);
        }

        if (!userCredit.isActive) {
          throw new Error(`Credit account suspended for user: ${userId}`);
        }

        const balanceBefore = userCredit.balance;
        
        // Check sufficient balance
        if (balanceBefore.lt(amount)) {
          throw new InsufficientCreditsError(amount, balanceBefore, userId);
        }

        const balanceAfter = balanceBefore.sub(amount);

        // Update balance
        const updatedCredit = await tx.userCredit.update({
          where: { userId },
          data: {
            balance: balanceAfter,
            totalUsed: userCredit.totalUsed.add(amount),
            updatedAt: new Date(),
          },
        });

        // Record transaction
        await tx.creditTransaction.create({
          data: {
            userCreditId: updatedCredit.id,
            type: transactionData.type,
            amount,
            balanceBefore,
            balanceAfter,
            description: transactionData.description,
            reference: transactionData.reference,
            metadata: transactionData.metadata,
            processedBy: transactionData.processedBy,
          },
        });

        // Clear cache
        await this.clearBalanceCache(userId);

        // Check for low balance alert
        if (updatedCredit.lowBalanceThreshold && 
            balanceAfter.lte(updatedCredit.lowBalanceThreshold)) {
          await this.handleLowBalance(userId, updatedCredit);
        }

        logger.debug('Credits deducted successfully:', {
          userId,
          amount: amount.toString(),
          balanceAfter: balanceAfter.toString(),
          type: transactionData.type,
        });

        return {
          balance: updatedCredit.balance,
          totalAllocated: updatedCredit.totalAllocated,
          totalUsed: updatedCredit.totalUsed,
          lowBalanceThreshold: updatedCredit.lowBalanceThreshold,
          autoTopupEnabled: updatedCredit.autoTopupEnabled,
          autoTopupAmount: updatedCredit.autoTopupAmount,
          isActive: updatedCredit.isActive,
          suspendedAt: updatedCredit.suspendedAt,
          suspensionReason: updatedCredit.suspensionReason,
        };
      });
    } catch (error) {
      logger.error('Failed to deduct credits:', error);
      throw error;
    }
  }

  /**
   * Get transaction history for user
   */
  async getTransactionHistory(
    userId: string,
    options: {
      page?: number;
      limit?: number;
      type?: CreditTransactionType;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ) {
    try {
      const { page = 1, limit = 50, type, startDate, endDate } = options;
      const skip = (page - 1) * limit;

      const userCredit = await this.prisma.userCredit.findUnique({
        where: { userId },
        select: { id: true },
      });

      if (!userCredit) {
        return { transactions: [], total: 0, page, limit };
      }

      const where: any = {
        userCreditId: userCredit.id,
      };

      if (type) {
        where.type = type;
      }

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = startDate;
        if (endDate) where.createdAt.lte = endDate;
      }

      const [transactions, total] = await Promise.all([
        this.prisma.creditTransaction.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.creditTransaction.count({ where }),
      ]);

      return {
        transactions,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      logger.error('Failed to get transaction history:', error);
      throw error;
    }
  }

  /**
   * Update credit account settings
   */
  async updateCreditSettings(
    userId: string,
    settings: {
      lowBalanceThreshold?: Decimal;
      autoTopupEnabled?: boolean;
      autoTopupAmount?: Decimal;
    }
  ): Promise<CreditBalance> {
    try {
      const updatedCredit = await this.prisma.userCredit.update({
        where: { userId },
        data: {
          ...settings,
          updatedAt: new Date(),
        },
      });

      // Clear cache
      await this.clearBalanceCache(userId);

      return {
        balance: updatedCredit.balance,
        totalAllocated: updatedCredit.totalAllocated,
        totalUsed: updatedCredit.totalUsed,
        lowBalanceThreshold: updatedCredit.lowBalanceThreshold,
        autoTopupEnabled: updatedCredit.autoTopupEnabled,
        autoTopupAmount: updatedCredit.autoTopupAmount,
        isActive: updatedCredit.isActive,
        suspendedAt: updatedCredit.suspendedAt,
        suspensionReason: updatedCredit.suspensionReason,
      };
    } catch (error) {
      logger.error('Failed to update credit settings:', error);
      throw error;
    }
  }

  /**
   * Suspend credit account
   */
  async suspendAccount(
    userId: string,
    reason: string,
    suspendedBy?: string
  ): Promise<void> {
    try {
      await this.prisma.userCredit.update({
        where: { userId },
        data: {
          isActive: false,
          suspendedAt: new Date(),
          suspensionReason: reason,
          updatedAt: new Date(),
        },
      });

      // Record suspension transaction
      const userCredit = await this.prisma.userCredit.findUnique({
        where: { userId },
      });

      if (userCredit) {
        await this.prisma.creditTransaction.create({
          data: {
            userCreditId: userCredit.id,
            type: 'PENALTY',
            amount: new Decimal(0),
            balanceBefore: userCredit.balance,
            balanceAfter: userCredit.balance,
            description: `Account suspended: ${reason}`,
            processedBy: suspendedBy,
          },
        });
      }

      // Clear cache
      await this.clearBalanceCache(userId);

      logger.warn('Credit account suspended:', { userId, reason, suspendedBy });
    } catch (error) {
      logger.error('Failed to suspend credit account:', error);
      throw error;
    }
  }

  /**
   * Reactivate credit account
   */
  async reactivateAccount(userId: string, reactivatedBy?: string): Promise<void> {
    try {
      await this.prisma.userCredit.update({
        where: { userId },
        data: {
          isActive: true,
          suspendedAt: null,
          suspensionReason: null,
          updatedAt: new Date(),
        },
      });

      // Record reactivation transaction
      const userCredit = await this.prisma.userCredit.findUnique({
        where: { userId },
      });

      if (userCredit) {
        await this.prisma.creditTransaction.create({
          data: {
            userCreditId: userCredit.id,
            type: 'ADJUSTMENT',
            amount: new Decimal(0),
            balanceBefore: userCredit.balance,
            balanceAfter: userCredit.balance,
            description: 'Account reactivated',
            processedBy: reactivatedBy,
          },
        });
      }

      // Clear cache
      await this.clearBalanceCache(userId);

      logger.info('Credit account reactivated:', { userId, reactivatedBy });
    } catch (error) {
      logger.error('Failed to reactivate credit account:', error);
      throw error;
    }
  }

  /**
   * Private helper methods
   */
  private async createCreditAccount(userId: string, tx?: any): Promise<any> {
    const prisma = tx || this.prisma;
    
    return await prisma.userCredit.create({
      data: {
        userId,
        balance: new Decimal(0),
        totalAllocated: new Decimal(0),
        totalUsed: new Decimal(0),
        isActive: true,
      },
    });
  }

  private async clearBalanceCache(userId: string): Promise<void> {
    try {
      await this.redis.del(`credits:balance:${userId}`);
    } catch (error) {
      logger.warn('Failed to clear balance cache:', error);
    }
  }

  private async handleLowBalance(userId: string, userCredit: any): Promise<void> {
    try {
      // Send low balance notification
      logger.warn('Low balance detected:', {
        userId,
        balance: userCredit.balance.toString(),
        threshold: userCredit.lowBalanceThreshold?.toString(),
      });

      // TODO: Implement notification system (email, webhook, etc.)
      
      // Handle auto-topup if enabled
      if (userCredit.autoTopupEnabled && userCredit.autoTopupAmount) {
        logger.info('Auto-topup triggered:', {
          userId,
          amount: userCredit.autoTopupAmount.toString(),
        });
        
        // TODO: Implement auto-topup logic (integrate with payment processor)
        // For now, just log the event
      }
    } catch (error) {
      logger.error('Failed to handle low balance:', error);
    }
  }
}
