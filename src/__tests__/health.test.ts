import { describe, it, expect } from '@jest/globals';

describe('Health Check', () => {
  it('should pass basic test', () => {
    expect(1 + 1).toBe(2);
  });

  it('should validate environment setup', () => {
    expect(process.env.NODE_ENV).toBeDefined();
  });
});

