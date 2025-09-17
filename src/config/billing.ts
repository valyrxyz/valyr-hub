import { z } from 'zod';
import { Decimal } from '@prisma/client/runtime/library';
import { BillingConfig } from '@/types/billing';

// Billing configuration schema
const billingConfigSchema = z.object({
  // Default settings
  DEFAULT_PRICING_TIER: z.string().default('standard'),
  CREDIT_DEDUCTION_MODE: z.enum(['REALTIME', 'BATCH']).default('REALTIME'),
  BATCH_PROCESSING_INTERVAL: z.coerce.number().default(5), // minutes
  
  // Credit settings
  LOW_BALANCE_THRESHOLD: z.coerce.number().default(10), // $10
  AUTO_TOPUP_ENABLED: z.coerce.boolean().default(false),
  DEFAULT_CREDIT_ALLOCATION: z.coerce.number().default(100), // $100 for new users
  
  // Tokenization settings
  TOKENIZATION_ENABLED: z.coerce.boolean().default(true),
  MIN_TOKENIZATION_AMOUNT: z.coerce.number().default(50), // $50 minimum
  TOKENIZATION_FEE_PERCENTAGE: z.coerce.number().default(2.5), // 2.5% fee
  
  // Blockchain settings
  ETHEREUM_CHAIN_ID: z.coerce.number().default(1),
  ARBITRUM_CHAIN_ID: z.coerce.number().default(42161),
  STARKNET_CHAIN_ID: z.coerce.number().default(23448594291968334),
  
  // Contract addresses (optional, can be set via environment)
  ETHEREUM_USAGE_TOKEN_CONTRACT: z.string().optional(),
  ARBITRUM_USAGE_TOKEN_CONTRACT: z.string().optional(),
  STARKNET_USAGE_TOKEN_CONTRACT: z.string().optional(),
  
  // Processing settings
  USAGE_LOG_RETENTION_DAYS: z.coerce.number().default(90),
  BATCH_SIZE: z.coerce.number().default(100),
  MAX_RETRY_ATTEMPTS: z.coerce.number().default(3),
  
  // Rate limiting for billing operations
  CREDIT_DEDUCTION_RATE_LIMIT: z.coerce.number().default(1000), // per minute
  TOKENIZATION_RATE_LIMIT: z.coerce.number().default(10), // per minute
  
  // Notification settings
  LOW_BALANCE_NOTIFICATION_ENABLED: z.coerce.boolean().default(true),
  USAGE_ALERT_THRESHOLD_PERCENTAGE: z.coerce.number().default(80), // 80% of credit limit
  
  // Security settings
  REQUIRE_PAYMENT_VERIFICATION: z.coerce.boolean().default(true),
  ALLOW_NEGATIVE_BALANCE: z.coerce.boolean().default(false),
  MAX_NEGATIVE_BALANCE: z.coerce.number().default(0),
});

// Validate and export billing configuration
function validateBillingConfig() {
  try {
    return billingConfigSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors.map(err => err.path.join('.')).join(', ');
      throw new Error(`Invalid billing configuration: ${missingVars}`);
    }
    throw error;
  }
}

export const billingConfig = validateBillingConfig();

// Create BillingConfig object for services
export const createBillingConfig = (): BillingConfig => ({
  defaultPricingTier: billingConfig.DEFAULT_PRICING_TIER,
  creditDeductionMode: billingConfig.CREDIT_DEDUCTION_MODE,
  batchProcessingInterval: billingConfig.BATCH_PROCESSING_INTERVAL,
  lowBalanceThreshold: new Decimal(billingConfig.LOW_BALANCE_THRESHOLD),
  autoTopupEnabled: billingConfig.AUTO_TOPUP_ENABLED,
  tokenizationEnabled: billingConfig.TOKENIZATION_ENABLED,
  supportedChains: [
    {
      chainId: billingConfig.ETHEREUM_CHAIN_ID,
      name: 'Ethereum',
      contractAddress: billingConfig.ETHEREUM_USAGE_TOKEN_CONTRACT || '',
      isActive: !!billingConfig.ETHEREUM_USAGE_TOKEN_CONTRACT,
    },
    {
      chainId: billingConfig.ARBITRUM_CHAIN_ID,
      name: 'Arbitrum',
      contractAddress: billingConfig.ARBITRUM_USAGE_TOKEN_CONTRACT || '',
      isActive: !!billingConfig.ARBITRUM_USAGE_TOKEN_CONTRACT,
    },
    {
      chainId: billingConfig.STARKNET_CHAIN_ID,
      name: 'StarkNet',
      contractAddress: billingConfig.STARKNET_USAGE_TOKEN_CONTRACT || '',
      isActive: !!billingConfig.STARKNET_USAGE_TOKEN_CONTRACT,
    },
  ].filter(chain => chain.isActive),
});

// Billing middleware configuration
export const billingMiddlewareConfig = {
  enableRealTimeDeduction: billingConfig.CREDIT_DEDUCTION_MODE === 'REALTIME',
  skipEndpoints: [
    '/health',
    '/docs',
    '/api',
    '/favicon.ico',
    '/metrics',
    '/api/v1/credits', // Don't charge for credit management endpoints
    '/api/v1/usage', // Don't charge for usage analytics endpoints
  ],
  defaultPricingTier: billingConfig.DEFAULT_PRICING_TIER,
  maxRequestSize: 50 * 1024 * 1024, // 50MB
  maxDuration: 300000, // 5 minutes
};

// Credit management configuration
export const creditConfig = {
  defaultAllocation: new Decimal(billingConfig.DEFAULT_CREDIT_ALLOCATION),
  lowBalanceThreshold: new Decimal(billingConfig.LOW_BALANCE_THRESHOLD),
  autoTopupEnabled: billingConfig.AUTO_TOPUP_ENABLED,
  allowNegativeBalance: billingConfig.ALLOW_NEGATIVE_BALANCE,
  maxNegativeBalance: new Decimal(billingConfig.MAX_NEGATIVE_BALANCE),
  notificationEnabled: billingConfig.LOW_BALANCE_NOTIFICATION_ENABLED,
  usageAlertThreshold: billingConfig.USAGE_ALERT_THRESHOLD_PERCENTAGE,
};

// Tokenization configuration
export const tokenizationConfig = {
  enabled: billingConfig.TOKENIZATION_ENABLED,
  minAmount: new Decimal(billingConfig.MIN_TOKENIZATION_AMOUNT),
  feePercentage: new Decimal(billingConfig.TOKENIZATION_FEE_PERCENTAGE),
  supportedChains: createBillingConfig().supportedChains,
  rateLimit: billingConfig.TOKENIZATION_RATE_LIMIT,
};

// Processing configuration
export const processingConfig = {
  batchSize: billingConfig.BATCH_SIZE,
  maxRetryAttempts: billingConfig.MAX_RETRY_ATTEMPTS,
  retentionDays: billingConfig.USAGE_LOG_RETENTION_DAYS,
  batchInterval: billingConfig.BATCH_PROCESSING_INTERVAL,
  rateLimits: {
    creditDeduction: billingConfig.CREDIT_DEDUCTION_RATE_LIMIT,
    tokenization: billingConfig.TOKENIZATION_RATE_LIMIT,
  },
};

// Validation helpers
export class BillingConfigValidator {
  /**
   * Validate billing configuration on startup
   */
  static validateConfig(): string[] {
    const errors: string[] = [];

    // Check required environment variables for tokenization
    if (billingConfig.TOKENIZATION_ENABLED) {
      const hasAnyContract = 
        billingConfig.ETHEREUM_USAGE_TOKEN_CONTRACT ||
        billingConfig.ARBITRUM_USAGE_TOKEN_CONTRACT ||
        billingConfig.STARKNET_USAGE_TOKEN_CONTRACT;

      if (!hasAnyContract) {
        errors.push('Tokenization is enabled but no contract addresses are configured');
      }
    }

    // Validate numeric ranges
    if (billingConfig.BATCH_PROCESSING_INTERVAL < 1) {
      errors.push('Batch processing interval must be at least 1 minute');
    }

    if (billingConfig.TOKENIZATION_FEE_PERCENTAGE < 0 || billingConfig.TOKENIZATION_FEE_PERCENTAGE > 100) {
      errors.push('Tokenization fee percentage must be between 0 and 100');
    }

    if (billingConfig.USAGE_ALERT_THRESHOLD_PERCENTAGE < 0 || billingConfig.USAGE_ALERT_THRESHOLD_PERCENTAGE > 100) {
      errors.push('Usage alert threshold percentage must be between 0 and 100');
    }

    // Validate credit settings
    if (billingConfig.LOW_BALANCE_THRESHOLD < 0) {
      errors.push('Low balance threshold must be non-negative');
    }

    if (billingConfig.DEFAULT_CREDIT_ALLOCATION < 0) {
      errors.push('Default credit allocation must be non-negative');
    }

    return errors;
  }

  /**
   * Validate chain configuration
   */
  static validateChainConfig(chainId: number, contractAddress?: string): boolean {
    if (!contractAddress) return false;
    
    // Basic contract address validation (can be enhanced)
    const isEthereumAddress = /^0x[a-fA-F0-9]{40}$/.test(contractAddress);
    const isStarkNetAddress = /^0x[a-fA-F0-9]{64}$/.test(contractAddress);
    
    return isEthereumAddress || isStarkNetAddress;
  }

  /**
   * Get configuration summary for logging
   */
  static getConfigSummary() {
    return {
      defaultPricingTier: billingConfig.DEFAULT_PRICING_TIER,
      creditDeductionMode: billingConfig.CREDIT_DEDUCTION_MODE,
      tokenizationEnabled: billingConfig.TOKENIZATION_ENABLED,
      supportedChains: createBillingConfig().supportedChains.length,
      batchProcessingInterval: billingConfig.BATCH_PROCESSING_INTERVAL,
      lowBalanceThreshold: billingConfig.LOW_BALANCE_THRESHOLD,
    };
  }
}

// Export configuration type
export type BillingConfigType = z.infer<typeof billingConfigSchema>;
