import { logger } from '@/utils/logger';

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  recoveryTimeout: number;
  monitoringPeriod: number;
  expectedErrors?: (error: Error) => boolean;
}

export class CircuitBreakerOpenError extends Error {
  constructor(serviceName: string) {
    super(`Circuit breaker is OPEN for service: ${serviceName}`);
    this.name = 'CircuitBreakerOpenError';
  }
}

export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private lastFailureTime?: number;
  private nextAttemptTime = 0;

  constructor(
    private serviceName: string,
    private options: CircuitBreakerOptions
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        throw new CircuitBreakerOpenError(this.serviceName);
      }
      // Transition to half-open to test the service
      this.state = CircuitBreakerState.HALF_OPEN;
      logger.info(`Circuit breaker for ${this.serviceName} transitioning to HALF_OPEN`);
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error: any) {
      this.onFailure(error);
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.state = CircuitBreakerState.CLOSED;
      logger.info(`Circuit breaker for ${this.serviceName} recovered to CLOSED`);
    }
  }

  private onFailure(error: Error): void {
    // Only count expected errors towards circuit breaker
    if (this.options.expectedErrors && !this.options.expectedErrors(error)) {
      return;
    }

    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      // Failed during half-open, go back to open
      this.state = CircuitBreakerState.OPEN;
      this.nextAttemptTime = Date.now() + this.options.recoveryTimeout;
      logger.warn(`Circuit breaker for ${this.serviceName} failed during HALF_OPEN, returning to OPEN`);
    } else if (this.failureCount >= this.options.failureThreshold) {
      // Too many failures, open the circuit
      this.state = CircuitBreakerState.OPEN;
      this.nextAttemptTime = Date.now() + this.options.recoveryTimeout;
      logger.error(
        `Circuit breaker for ${this.serviceName} OPENED after ${this.failureCount} failures`,
        { error: error.message }
      );
    }
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  getStats() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
    };
  }

  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = undefined;
    this.nextAttemptTime = 0;
    logger.info(`Circuit breaker for ${this.serviceName} manually reset`);
  }
}

// Circuit breaker registry for managing multiple services
export class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>();

  getOrCreate(serviceName: string, options: CircuitBreakerOptions): CircuitBreaker {
    if (!this.breakers.has(serviceName)) {
      this.breakers.set(serviceName, new CircuitBreaker(serviceName, options));
    }
    return this.breakers.get(serviceName)!;
  }

  get(serviceName: string): CircuitBreaker | undefined {
    return this.breakers.get(serviceName);
  }

  getAllStats() {
    const stats: Record<string, any> = {};
    for (const [name, breaker] of this.breakers) {
      stats[name] = breaker.getStats();
    }
    return stats;
  }

  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}

// Global registry instance
export const circuitBreakerRegistry = new CircuitBreakerRegistry();
