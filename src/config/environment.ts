import { z } from 'zod';

const envSchema = z.object({
  // Server Configuration
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),

  // Database Configuration
  DATABASE_URL: z.string(),

  // Redis Configuration
  REDIS_URL: z.string(),

  // JWT Configuration
  JWT_SECRET: z.string(),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // IPFS Configuration
  IPFS_API_URL: z.string().default('http://localhost:5001'),
  IPFS_GATEWAY_URL: z.string().default('http://localhost:8080'),

  // Blockchain Configuration
  ETHEREUM_RPC_URL: z.string().optional(),
  ARBITRUM_RPC_URL: z.string().optional(),
  STARKNET_RPC_URL: z.string().optional(),

  // Private Keys
  ETHEREUM_PRIVATE_KEY: z.string().optional(),
  ARBITRUM_PRIVATE_KEY: z.string().optional(),
  STARKNET_PRIVATE_KEY: z.string().optional(),

  // Contract Addresses
  ETHEREUM_REGISTRY_CONTRACT: z.string().optional(),
  ARBITRUM_REGISTRY_CONTRACT: z.string().optional(),
  STARKNET_REGISTRY_CONTRACT: z.string().optional(),

  // Webhook Configuration
  WEBHOOK_SECRET: z.string().optional(),

  // Rate Limiting
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW: z.coerce.number().default(60000),

  // File Upload Configuration
  MAX_FILE_SIZE: z.coerce.number().default(10485760), // 10MB
  ALLOWED_FILE_TYPES: z.string().default('application/json,text/yaml,text/plain'),

  // Verification Configuration
  VERIFIER_TIMEOUT: z.coerce.number().default(300000), // 5 minutes
  MAX_VERIFICATION_RETRIES: z.coerce.number().default(3),

  // Logging Configuration
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  LOG_PRETTY: z.coerce.boolean().default(true),

  // External Services
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  // Monitoring
  SENTRY_DSN: z.string().optional(),
  METRICS_ENABLED: z.coerce.boolean().default(true),
});

function validateEnvironment() {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors.map(err => err.path.join('.')).join(', ');
      throw new Error(`Missing or invalid environment variables: ${missingVars}`);
    }
    throw error;
  }
}

export const config = validateEnvironment();

export type Config = z.infer<typeof envSchema>;

