import { Decimal } from '@prisma/client/runtime/library';

// Default pricing tiers configuration
export const DEFAULT_PRICING_TIERS = [
  {
    name: 'free',
    description: 'Free tier with basic usage limits',
    basePrice: new Decimal('0.001'), // $0.001 per API call
    sizeMultiplier: new Decimal('0.0001'), // $0.0001 per KB
    durationMultiplier: new Decimal('0.00001'), // $0.00001 per second
    endpointPricing: {
      '/api/v1/auth': 0.0005, // Cheaper for auth endpoints
      '/api/v1/proofs': 0.01, // More expensive for proof operations
      '/api/v1/verification': 0.005, // Medium cost for verification
      '/api/v1/blockchain': 0.02, // Most expensive for blockchain operations
    },
    maxRequestSize: 1024 * 1024, // 1MB
    maxDuration: 30000, // 30 seconds
    isActive: true,
    isDefault: true,
  },
  {
    name: 'standard',
    description: 'Standard tier for regular usage',
    basePrice: new Decimal('0.002'), // $0.002 per API call
    sizeMultiplier: new Decimal('0.0002'), // $0.0002 per KB
    durationMultiplier: new Decimal('0.00002'), // $0.00002 per second
    endpointPricing: {
      '/api/v1/auth': 0.001,
      '/api/v1/proofs': 0.02,
      '/api/v1/verification': 0.01,
      '/api/v1/blockchain': 0.04,
    },
    maxRequestSize: 5 * 1024 * 1024, // 5MB
    maxDuration: 60000, // 60 seconds
    isActive: true,
    isDefault: false,
  },
  {
    name: 'premium',
    description: 'Premium tier for high-volume usage',
    basePrice: new Decimal('0.005'), // $0.005 per API call
    sizeMultiplier: new Decimal('0.0005'), // $0.0005 per KB
    durationMultiplier: new Decimal('0.00005'), // $0.00005 per second
    endpointPricing: {
      '/api/v1/auth': 0.002,
      '/api/v1/proofs': 0.05,
      '/api/v1/verification': 0.025,
      '/api/v1/blockchain': 0.1,
    },
    maxRequestSize: 10 * 1024 * 1024, // 10MB
    maxDuration: 120000, // 120 seconds
    isActive: true,
    isDefault: false,
  },
  {
    name: 'enterprise',
    description: 'Enterprise tier with custom pricing',
    basePrice: new Decimal('0.01'), // $0.01 per API call
    sizeMultiplier: new Decimal('0.001'), // $0.001 per KB
    durationMultiplier: new Decimal('0.0001'), // $0.0001 per second
    endpointPricing: {
      '/api/v1/auth': 0.005,
      '/api/v1/proofs': 0.1,
      '/api/v1/verification': 0.05,
      '/api/v1/blockchain': 0.2,
    },
    maxRequestSize: 50 * 1024 * 1024, // 50MB
    maxDuration: 300000, // 300 seconds
    isActive: true,
    isDefault: false,
  },
];

// Pricing calculation helpers
export class PricingCalculator {
  /**
   * Calculate the total cost for an API call
   */
  static calculateCost(params: {
    basePrice: Decimal;
    sizeMultiplier: Decimal;
    durationMultiplier: Decimal;
    endpointPricing?: Record<string, number>;
    endpoint: string;
    requestSize: number;
    responseSize: number;
    duration: number;
  }): {
    basePrice: Decimal;
    sizePrice: Decimal;
    durationPrice: Decimal;
    endpointPrice: Decimal;
    totalPrice: Decimal;
  } {
    const { basePrice, sizeMultiplier, durationMultiplier, endpointPricing, endpoint, requestSize, responseSize, duration } = params;

    // Base price
    const baseCost = basePrice;

    // Size-based pricing (per KB)
    const totalSize = requestSize + responseSize;
    const sizeInKB = totalSize / 1024;
    const sizeCost = new Decimal(sizeInKB).mul(sizeMultiplier);

    // Duration-based pricing (per second)
    const durationInSeconds = duration / 1000;
    const durationCost = new Decimal(durationInSeconds).mul(durationMultiplier);

    // Endpoint-specific pricing
    let endpointCost = new Decimal(0);
    if (endpointPricing && endpointPricing[endpoint]) {
      endpointCost = new Decimal(endpointPricing[endpoint]);
    }

    // Total cost
    const totalCost = baseCost.add(sizeCost).add(durationCost).add(endpointCost);

    return {
      basePrice: baseCost,
      sizePrice: sizeCost,
      durationPrice: durationCost,
      endpointPrice: endpointCost,
      totalPrice: totalCost,
    };
  }

  /**
   * Estimate cost before API call completion
   */
  static estimateCost(params: {
    basePrice: Decimal;
    sizeMultiplier: Decimal;
    durationMultiplier: Decimal;
    endpointPricing?: Record<string, number>;
    endpoint: string;
    requestSize: number;
    estimatedDuration?: number;
    estimatedResponseSize?: number;
  }): Decimal {
    const {
      basePrice,
      sizeMultiplier,
      durationMultiplier,
      endpointPricing,
      endpoint,
      requestSize,
      estimatedDuration = 1000, // Default 1 second
      estimatedResponseSize = Math.max(requestSize, 1024), // At least 1KB
    } = params;

    const calculation = this.calculateCost({
      basePrice,
      sizeMultiplier,
      durationMultiplier,
      endpointPricing,
      endpoint,
      requestSize,
      responseSize: estimatedResponseSize,
      duration: estimatedDuration,
    });

    return calculation.totalPrice;
  }

  /**
   * Get pricing tier by name
   */
  static getPricingTier(name: string) {
    return DEFAULT_PRICING_TIERS.find(tier => tier.name === name);
  }

  /**
   * Get default pricing tier
   */
  static getDefaultPricingTier() {
    return DEFAULT_PRICING_TIERS.find(tier => tier.isDefault) || DEFAULT_PRICING_TIERS[0];
  }

  /**
   * Get all active pricing tiers
   */
  static getActivePricingTiers() {
    return DEFAULT_PRICING_TIERS.filter(tier => tier.isActive);
  }
}

// Pricing validation helpers
export class PricingValidator {
  /**
   * Validate pricing tier configuration
   */
  static validatePricingTier(tier: any): string[] {
    const errors: string[] = [];

    if (!tier.name || typeof tier.name !== 'string') {
      errors.push('Pricing tier name is required and must be a string');
    }

    if (!tier.basePrice || !(tier.basePrice instanceof Decimal) || tier.basePrice.lt(0)) {
      errors.push('Base price must be a positive Decimal');
    }

    if (!tier.sizeMultiplier || !(tier.sizeMultiplier instanceof Decimal) || tier.sizeMultiplier.lt(0)) {
      errors.push('Size multiplier must be a positive Decimal');
    }

    if (!tier.durationMultiplier || !(tier.durationMultiplier instanceof Decimal) || tier.durationMultiplier.lt(0)) {
      errors.push('Duration multiplier must be a positive Decimal');
    }

    if (tier.maxRequestSize && (typeof tier.maxRequestSize !== 'number' || tier.maxRequestSize <= 0)) {
      errors.push('Max request size must be a positive number');
    }

    if (tier.maxDuration && (typeof tier.maxDuration !== 'number' || tier.maxDuration <= 0)) {
      errors.push('Max duration must be a positive number');
    }

    if (tier.endpointPricing && typeof tier.endpointPricing !== 'object') {
      errors.push('Endpoint pricing must be an object');
    }

    return errors;
  }

  /**
   * Validate request against pricing tier limits
   */
  static validateRequest(params: {
    requestSize: number;
    duration: number;
    maxRequestSize?: number;
    maxDuration?: number;
  }): string[] {
    const errors: string[] = [];
    const { requestSize, duration, maxRequestSize, maxDuration } = params;

    if (maxRequestSize && requestSize > maxRequestSize) {
      errors.push(`Request size ${requestSize} exceeds limit of ${maxRequestSize} bytes`);
    }

    if (maxDuration && duration > maxDuration) {
      errors.push(`Request duration ${duration}ms exceeds limit of ${maxDuration}ms`);
    }

    return errors;
  }
}

// Export types for use in other modules
export interface PricingTierConfig {
  name: string;
  description: string;
  basePrice: Decimal;
  sizeMultiplier: Decimal;
  durationMultiplier: Decimal;
  endpointPricing?: Record<string, number>;
  maxRequestSize?: number;
  maxDuration?: number;
  isActive: boolean;
  isDefault: boolean;
}
