import { logger } from '@/utils/logger';
import { getRedisClient, connectRedis, disconnectRedis } from '@/services/redis';
import { MinimalVerificationService } from '@/services/verifier-minimal';
import { config } from '@/config/environment';
import type Redis from 'ioredis';

interface VerificationJob {
  id: string;
  type: 'zk-proof' | 'signature' | 'merkle-tree';
  payload: any;
  priority: number;
  createdAt: Date;
}

class VerifierNode {
  private redis: Redis;
  private verificationService: MinimalVerificationService;
  private isRunning = false;
  private workerId: string;

  constructor() {
    this.redis = getRedisClient();
    this.verificationService = new MinimalVerificationService();
    this.workerId = `verifier-${process.pid}-${Date.now()}`;
  }

  async start(): Promise<void> {
    try {
      logger.info(`Starting verifier node: ${this.workerId}`);
      
      await connectRedis();
      logger.info('Connected to Redis');

      this.isRunning = true;
      
      await this.processJobs();
      
    } catch (error) {
      logger.error('Failed to start verifier node:', error);
      process.exit(1);
    }
  }

  async stop(): Promise<void> {
    logger.info('Stopping verifier node...');
    this.isRunning = false;
    await disconnectRedis();
    logger.info('Verifier node stopped');
  }

  private async processJobs(): Promise<void> {
    while (this.isRunning) {
      try {
        const jobData = await this.redis.brpop('verification_queue', 5);
        
        if (jobData && jobData[1]) {
          const job: VerificationJob = JSON.parse(jobData[1]);
          await this.processJob(job);
        }
      } catch (error) {
        logger.error('Error processing jobs:', error);
        await this.sleep(1000);
      }
    }
  }

  private async processJob(job: VerificationJob): Promise<void> {
    logger.info(`Processing job ${job.id} of type ${job.type}`);
    
    try {
      let result;
      
      switch (job.type) {
        case 'zk-proof':
          result = await this.verificationService.verifyZKProof(job.payload);
          break;
        case 'signature':
          result = await this.verificationService.verifySignature(job.payload);
          break;
        case 'merkle-tree':
          result = await this.verificationService.verifyMerkleProof(job.payload);
          break;
        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }

      await this.redis.hset(
        `verification_result:${job.id}`,
        {
          status: 'completed',
          result: JSON.stringify(result),
          completedAt: new Date().toISOString(),
          workerId: this.workerId
        }
      );

      await this.redis.expire(`verification_result:${job.id}`, 86400);

      logger.info(`Job ${job.id} completed successfully`);

    } catch (error) {
      logger.error(`Job ${job.id} failed:`, error);
      
      await this.redis.hset(
        `verification_result:${job.id}`,
        {
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
          completedAt: new Date().toISOString(),
          workerId: this.workerId
        }
      );

      await this.redis.expire(`verification_result:${job.id}`, 86400);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

const verifier = new VerifierNode();

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  await verifier.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  await verifier.stop();
  process.exit(0);
});

verifier.start().catch((error) => {
  logger.error('Failed to start verifier node:', error);
  process.exit(1);
}); 