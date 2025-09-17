import { Decimal } from '@prisma/client/runtime/library';

// API Usage Tracking Types
export interface ApiUsageMetrics {
  userId?: string;
  apiKeyId?: string;
  userAgent?: string;
  ipAddress?: string;
  method: string;
  endpoint: string;
  fullPath: string;
  requestSize: number;
  responseSize: number;
  startTime: Date;
  endTime: Date;
  duration: number;
  statusCode: number;
  success: boolean;
  errorMessage?: string;
  creditsCost?: Decimal;
  pricingTier?: string;
  metadata?: Record<string, any>;
}

// Credit Management Types
export interface CreditBalance {
  balance: Decimal;
  totalAllocated: Decimal;
  totalUsed: Decimal;
  lowBalanceThreshold?: Decimal;
  autoTopupEnabled: boolean;
  autoTopupAmount?: Decimal;
  isActive: boolean;
  suspendedAt?: Date;
  suspensionReason?: string;
}

export interface CreditTransactionData {
  type: CreditTransactionType;
  amount: Decimal;
  description?: string;
  reference?: string;
  metadata?: Record<string, any>;
  processedBy?: string;
}

export enum CreditTransactionType {
  TOPUP = 'TOPUP',
  USAGE = 'USAGE',
  REFUND = 'REFUND',
  ADJUSTMENT = 'ADJUSTMENT',
  BONUS = 'BONUS',
  PENALTY = 'PENALTY',
}

// Pricing Types
export interface PricingRule {
  basePrice: Decimal;
  sizeMultiplier: Decimal;
  durationMultiplier: Decimal;
  endpointPricing?: Record<string, number>;
  maxRequestSize?: number;
  maxDuration?: number;
}

export interface PricingCalculation {
  basePrice: Decimal;
  sizePrice: Decimal;
  durationPrice: Decimal;
  endpointPrice: Decimal;
  totalPrice: Decimal;
  pricingTier: string;
}

// Tokenization Types
export interface UsageTokenData {
  tokenId: string;
  chainId: number;
  contractAddress: string;
  usageStartDate: Date;
  usageEndDate: Date;
  totalApiCalls: number;
  totalCreditsUsed: Decimal;
  metadata: UsageTokenMetadata;
  proofHash?: string;
}

export interface UsageTokenMetadata {
  endpoints: Record<string, {
    calls: number;
    totalDuration: number;
    totalSize: number;
    creditsUsed: Decimal;
  }>;
  dailyBreakdown: Record<string, {
    calls: number;
    creditsUsed: Decimal;
  }>;
  averageResponseTime: number;
  successRate: number;
  topEndpoints: Array<{
    endpoint: string;
    calls: number;
    percentage: number;
  }>;
}

export enum TokenStatus {
  MINTED = 'MINTED',
  TRANSFERRED = 'TRANSFERRED',
  REDEEMED = 'REDEEMED',
  EXPIRED = 'EXPIRED',
  BURNED = 'BURNED',
}

// Usage Analytics Types
export interface UsageAnalytics {
  totalCalls: number;
  totalCreditsUsed: Decimal;
  averageResponseTime: number;
  successRate: number;
  topEndpoints: Array<{
    endpoint: string;
    calls: number;
    creditsUsed: Decimal;
    averageResponseTime: number;
  }>;
  dailyUsage: Array<{
    date: string;
    calls: number;
    creditsUsed: Decimal;
  }>;
  errorBreakdown: Record<number, number>; // status code -> count
}

export interface UsageFilter {
  userId?: string;
  apiKeyId?: string;
  startDate?: Date;
  endDate?: Date;
  endpoint?: string;
  method?: string;
  success?: boolean;
  minDuration?: number;
  maxDuration?: number;
}

// Billing Configuration Types
export interface BillingConfig {
  defaultPricingTier: string;
  creditDeductionMode: 'REALTIME' | 'BATCH';
  batchProcessingInterval: number; // minutes
  lowBalanceThreshold: Decimal;
  autoTopupEnabled: boolean;
  tokenizationEnabled: boolean;
  supportedChains: Array<{
    chainId: number;
    name: string;
    contractAddress: string;
    isActive: boolean;
  }>;
}

// API Response Types
export interface ApiUsageResponse {
  logs: ApiUsageMetrics[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  analytics: UsageAnalytics;
}

export interface CreditResponse {
  balance: CreditBalance;
  recentTransactions: Array<{
    id: string;
    type: CreditTransactionType;
    amount: Decimal;
    balanceAfter: Decimal;
    description?: string;
    processedAt: Date;
  }>;
}

export interface TokenizationResponse {
  token: UsageTokenData;
  mintTxHash?: string;
  estimatedGasCost?: Decimal;
  blockchainFee?: Decimal;
}

// Error Types
export class InsufficientCreditsError extends Error {
  constructor(
    public required: Decimal,
    public available: Decimal,
    public userId: string
  ) {
    super(`Insufficient credits: required ${required}, available ${available}`);
    this.name = 'InsufficientCreditsError';
  }
}

export class PricingTierNotFoundError extends Error {
  constructor(public tierName: string) {
    super(`Pricing tier not found: ${tierName}`);
    this.name = 'PricingTierNotFoundError';
  }
}

export class TokenizationError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'TokenizationError';
  }
}

// Middleware Types
export interface UsageTrackingContext {
  startTime: Date;
  userId?: string;
  apiKeyId?: string;
  pricingTier?: string;
  skipBilling?: boolean;
}

export interface BillingMiddlewareOptions {
  enableRealTimeDeduction: boolean;
  skipEndpoints: string[];
  defaultPricingTier: string;
  maxRequestSize: number;
  maxDuration: number;
}
