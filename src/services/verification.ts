import { getPrismaClient } from '@/database/connection';
import { cacheService } from '@/services/redis';
import { IPFSService } from '@/services/ipfs';
import { BlockchainService } from '@/services/blockchain';
import { WebhookService } from '@/services/webhook';
import { logger } from '@/utils/logger';
import { config } from '@/config/environment';
import { ProofType, SubmissionStatus, LogLevel } from '@prisma/client';

export class VerificationService {
  private prisma = getPrismaClient();
  private ipfsService = new IPFSService();
  private blockchainService = new BlockchainService();
  private webhookService = new WebhookService();

  /**
   * Start the verification process for a submission
   */
  async startVerification(submissionId: string): Promise<void> {
    try {
      // Update submission status
      await this.prisma.submission.update({
        where: { id: submissionId },
        data: { status: 'PROCESSING' },
      });

      // Log verification start
      await this.logVerification(submissionId, 'INFO', 'Verification process started');

      // Get submission details
      const submission = await this.prisma.submission.findUnique({
        where: { id: submissionId },
        include: {
          vApp: true,
          user: true,
        },
      });

      if (!submission) {
        throw new Error('Submission not found');
      }

      // Download and validate files from IPFS
      const { sourceCode, proofData, metadata } = await this.downloadSubmissionFiles(submission);

      // Validate metadata format
      await this.validateMetadata(metadata, submissionId);

      // Extract and validate proofs
      const proofs = await this.extractProofs(proofData, submissionId);

      // Verify each proof
      const verificationResults = await this.verifyProofs(proofs, submissionId);

      // Create proof records
      await this.createProofRecords(submission, proofs, verificationResults);

      // Determine overall verification status
      const allValid = verificationResults.every(result => result.isValid);
      const finalStatus: SubmissionStatus = allValid ? 'VERIFIED' : 'FAILED';

      // Update submission status
      await this.prisma.submission.update({
        where: { id: submissionId },
        data: {
          status: finalStatus,
          verifiedAt: allValid ? new Date() : null,
        },
      });

      // Anchor to blockchains if verified
      if (allValid) {
        await this.anchorToBlockchains(submission, verificationResults);
      }

      // Send webhook notifications
      await this.webhookService.sendSubmissionProcessed(submission, finalStatus);

      // Log completion
      await this.logVerification(
        submissionId,
        allValid ? 'INFO' : 'WARN',
        `Verification completed: ${finalStatus}`
      );

    } catch (error: any) {
      throw new Error(`Failed to download submission files: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Download submission files from IPFS
   */
  private async downloadSubmissionFiles(submission: any): Promise<{
    sourceCode: Buffer;
    proofData: any;
    metadata: any;
  }> {
    try {
      const [sourceCode, proofData, metadata] = await Promise.all([
        this.ipfsService.downloadFile(submission.sourceHash),
        this.ipfsService.downloadJSON(submission.proofHash),
        this.ipfsService.downloadJSON(submission.metadataHash),
      ]);

      return { sourceCode, proofData, metadata };
    } catch (error: any) {
      throw new Error(`Failed to download submission files: ${error?.message || "Unknown error"}`);
    }
  }

  /**
   * Validate vapp.yaml metadata format
   */
  private async validateMetadata(metadata: any, submissionId: string): Promise<void> {
    await this.logVerification(submissionId, 'INFO', 'Validating metadata format');

    // Basic validation of vapp.yaml structure
    const requiredFields = ['name', 'version', 'proofs', 'verifier'];
    for (const field of requiredFields) {
      if (!metadata[field]) {
        throw new Error(`Missing required metadata field: ${field}`);
      }
    }

    // Validate proofs array
    if (!Array.isArray(metadata.proofs) || metadata.proofs.length === 0) {
      throw new Error('Metadata must contain at least one proof');
    }

    // Validate each proof entry
    for (const proof of metadata.proofs) {
      if (!proof.type || !proof.circuit || !proof.inputs) {
        throw new Error('Invalid proof metadata structure');
      }

      if (!['GROTH16', 'PLONK', 'STARK'].includes(proof.type)) {
        throw new Error(`Unsupported proof type: ${proof.type}`);
      }
    }

    await this.logVerification(submissionId, 'INFO', 'Metadata validation passed');
  }

  /**
   * Extract proofs from proof data
   */
  private async extractProofs(proofData: any, submissionId: string): Promise<any[]> {
    await this.logVerification(submissionId, 'INFO', 'Extracting proofs from submission');

    if (!proofData.proofs || !Array.isArray(proofData.proofs)) {
      throw new Error('Invalid proof data structure');
    }

    const proofs = [];
    for (const proof of proofData.proofs) {
      // Validate proof structure
      if (!proof.type || !proof.proof || !proof.publicInputs || !proof.verifierKey) {
        throw new Error('Invalid proof structure');
      }

      proofs.push({
        type: proof.type as ProofType,
        circuitHash: proof.circuitHash || 'unknown',
        proofData: proof.proof,
        publicInputs: proof.publicInputs,
        verifierKey: proof.verifierKey,
      });
    }

    await this.logVerification(submissionId, 'INFO', `Extracted ${proofs.length} proofs`);
    return proofs;
  }

  /**
   * Verify zero-knowledge proofs
   */
  private async verifyProofs(proofs: any[], submissionId: string): Promise<any[]> {
    const results = [];

    for (let i = 0; i < proofs.length; i++) {
      const proof = proofs[i];
      await this.logVerification(
        submissionId,
        'INFO',
        `Verifying proof ${i + 1}/${proofs.length} (${proof.type})`
      );

      try {
        // Simulate proof verification based on type
        const isValid = await this.simulateProofVerification(proof);
        
        results.push({
          ...proof,
          isValid,
          verifierNode: `verifier-${Math.floor(Math.random() * 3) + 1}`,
          verifiedAt: new Date(),
        });

        await this.logVerification(
          submissionId,
          isValid ? 'INFO' : 'WARN',
          `Proof ${i + 1} verification: ${isValid ? 'VALID' : 'INVALID'}`
        );

      } catch (error: any) {
        results.push({
          ...proof,
          isValid: false,
          verifierNode: null,
          verifiedAt: null,
          error: (error as Error)?.message || 'Unknown error',
        });

        await this.logVerification(
          submissionId,
          'ERROR',
          `Proof ${i + 1} verification failed: ${(error as Error)?.message || 'Unknown error'}`
        );
      }
    }

    return results;
  }

  /**
   * Simulate proof verification
   * TODO: Implement actual proof verification logic
   */
  private async simulateProofVerification(proof: any): Promise<boolean> {
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

    switch (proof.type) {
      case 'GROTH16':
        return this.verifyGroth16Proof(proof);
      case 'PLONK':
        return this.verifyPlonkProof(proof);
      case 'STARK':
        return this.verifyStarkProof(proof);
      default:
        throw new Error(`Unsupported proof type: ${proof.type}`);
    }
  }

  /**
   * Simulate Groth16 proof verification
   */
  private verifyGroth16Proof(proof: any): boolean {
    return Math.random() > 0.1;
  }

  /**
   * Simulate PLONK proof verification
   */
  private verifyPlonkProof(proof: any): boolean {
    return Math.random() > 0.15;
  }

  /**
   * Simulate STARK proof verification
   */
  private verifyStarkProof(proof: any): boolean {
    return Math.random() > 0.05;
  }

  /**
   * Create proof records in database
   */
  private async createProofRecords(submission: any, proofs: any[], results: any[]): Promise<void> {
    for (let i = 0; i < proofs.length; i++) {
      const proof = proofs[i];
      const result = results[i];

      await this.prisma.proof.create({
        data: {
          vAppId: submission.vAppId,
          submissionId: submission.id,
          type: proof.type,
          circuitHash: proof.circuitHash,
          proofData: proof.proofData,
          publicInputs: proof.publicInputs,
          verifierKey: proof.verifierKey,
          isValid: result.isValid,
          verifiedAt: result.verifiedAt,
          verifierNode: result.verifierNode,
        },
      });
    }
  }

  /**
   * Anchor verification results to blockchains
   */
  private async anchorToBlockchains(submission: any, results: any[]): Promise<void> {
    try {
      await this.logVerification(
        submission.id,
        'INFO',
        'Anchoring verification results to blockchains'
      );

      // Create verification hash
      const verificationHash = this.createVerificationHash(submission, results);

      // Anchor to each supported blockchain
      const anchorPromises = [
        this.blockchainService.anchorToEthereum(verificationHash),
        this.blockchainService.anchorToArbitrum(verificationHash),
        this.blockchainService.anchorToStarknet(verificationHash),
      ];

      const anchorResults = await Promise.allSettled(anchorPromises);

      // Update proof records with transaction hashes
      for (let i = 0; i < results.length; i++) {
        const updateData: any = {};

        if (anchorResults[0]?.status === 'fulfilled') {
          updateData.ethereumTxHash = (anchorResults[0] as PromiseFulfilledResult<string>).value;
        }
        if (anchorResults[1]?.status === 'fulfilled') {
          updateData.arbitrumTxHash = (anchorResults[1] as PromiseFulfilledResult<string>).value;
        }
        if (anchorResults[2]?.status === 'fulfilled') {
          updateData.starknetTxHash = (anchorResults[2] as PromiseFulfilledResult<string>).value;
        }

        if (Object.keys(updateData).length > 0) {
          await this.prisma.proof.updateMany({
            where: { submissionId: submission.id },
            data: updateData,
          });
        }
      }

      await this.logVerification(
        submission.id,
        'INFO',
        'Blockchain anchoring completed',
        { anchorResults: anchorResults.map(r => r.status) }
      );

    } catch (error: any) {
      await this.logVerification(
        submission.id,
        'WARN',
        `Blockchain anchoring failed: ${error instanceof Error ? error?.message || "Unknown error" : String(error)}`
      );
    }
  }

  /**
   * Create verification hash for blockchain anchoring
   */
  private createVerificationHash(submission: any, results: any[]): string {
    const crypto = require('crypto');
    const data = {
      submissionId: submission.id,
      vAppId: submission.vAppId,
      sourceHash: submission.sourceHash,
      proofHash: submission.proofHash,
      results: results.map(r => ({
        type: r.type,
        isValid: r.isValid,
        verifiedAt: r.verifiedAt,
      })),
      timestamp: new Date().toISOString(),
    };

    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  }

  /**
   * Log verification events
   */
  private async logVerification(
    submissionId: string,
    level: LogLevel,
    message: string,
    details?: any
  ): Promise<void> {
    try {
      const logMethod = logger[level.toLowerCase() as 'info' | 'warn' | 'error'];
      if (logMethod) {
        logMethod(message, { submissionId, details });
      }

      await this.prisma.verificationLog.create({
        data: {
          submissionId,
          level,
          message,
          details: details || null,
          verifierNode: `verifier-${process.env.HOSTNAME || 'local'}`,
        },
      });
    } catch (error: any) {
      logger.error('Failed to log verification event:', error);
    }
  }

  /**
   * Log verification events
   */
  private async logVerificationEvent(
    submissionId: string,
    level: LogLevel,
    message: string,
    details?: any
  ): Promise<void> {
    try {
      const logMethod = logger[level.toLowerCase() as 'info' | 'warn' | 'error'];
      if (logMethod) {
        logMethod(message, { submissionId, details });
      }

      await this.prisma.verificationLog.create({
        data: {
          submissionId,
          level,
          message,
          details: details || null,
          verifierNode: `verifier-${process.env.HOSTNAME || 'local'}`,
        },
      });
    } catch (error: any) {
      logger.error('Failed to log verification event:', error);
    }
  }

  /**
   * Get verification status for a submission
   */
  async getVerificationStatus(submissionId: string): Promise<any> {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        proofs: true,
        logs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!submission) {
      throw new Error('Submission not found');
    }

    return {
      status: submission.status,
      verifiedAt: submission.verifiedAt,
      proofCount: submission.proofs.length,
      validProofCount: submission.proofs.filter((p: any) => p.isValid).length,
      recentLogs: submission.logs,
    };
  }

  /**
   * Retry failed verification
   */
  async retryVerification(submissionId: string): Promise<void> {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
    });

    if (!submission) {
      throw new Error('Submission not found');
    }

    if (submission.status === 'PROCESSING') {
      throw new Error('Verification already in progress');
    }

    // Clear previous proof records
    await this.prisma.proof.deleteMany({
      where: { submissionId },
    });

    // Start verification again
    await this.startVerification(submissionId);
  }

  /**
   * Verify submission
   */
  async verifySubmission(submissionId: string): Promise<void> {
    try {
      // Get submission with proofs
      const submission = await this.prisma.submission.findUnique({
        where: { id: submissionId },
        include: { proofs: true },
      });

      if (!submission) {
        throw new Error('Submission not found');
      }

      // Verify each proof
      const results = await this.verifyProofs(submission.proofs, submissionId);

      // Update submission status based on verification results
      const allValid = results.every(result => result.isValid);
      const status = allValid ? 'VERIFIED' : 'FAILED';

      await this.prisma.submission.update({
        where: { id: submissionId },
        data: { status },
      });

      // Log verification completion
      await this.logVerification(
        submissionId,
        'INFO',
        `Verification completed with status: ${status}`,
        { results }
      );

    } catch (error: any) {
      logger.error(`Failed to verify STARK proof: ${error?.message || 'Unknown error'}`, error);
      throw error;
    }
  }

  /**
   * Verify ZK proof (for verifier node)
   */
  async verifyZKProof(payload: any): Promise<any> {
    try {
      const { type, proof, publicInputs, verifierKey } = payload;
      
      let isValid = false;
      switch (type) {
        case 'GROTH16':
          isValid = this.verifyGroth16Proof({ proof, publicInputs, verifierKey });
          break;
        case 'PLONK':
          isValid = this.verifyPlonkProof({ proof, publicInputs, verifierKey });
          break;
        case 'STARK':
          isValid = this.verifyStarkProof({ proof, publicInputs, verifierKey });
          break;
        default:
          throw new Error(`Unsupported proof type: ${type}`);
      }

      return {
        isValid,
        type,
        verifiedAt: new Date(),
        verifierNode: `verifier-${process.pid}`,
      };
    } catch (error: any) {
      logger.error(`Failed to verify ZK proof: ${error?.message || 'Unknown error'}`, error);
      throw error;
    }
  }

  /**
   * Verify signature (for verifier node)
   */
  async verifySignature(payload: any): Promise<any> {
    try {
      const { signature, message, publicKey, algorithm = 'ECDSA' } = payload;
      
      // Simulate signature verification
      const isValid = signature && message && publicKey && 
                     signature.length > 0 && message.length > 0 && publicKey.length > 0;

      return {
        isValid,
        algorithm,
        verifiedAt: new Date(),
        verifierNode: `verifier-${process.pid}`,
      };
    } catch (error: any) {
      logger.error(`Failed to verify signature: ${error?.message || 'Unknown error'}`, error);
      throw error;
    }
  }

  /**
   * Verify Merkle proof (for verifier node)
   */
  async verifyMerkleProof(payload: any): Promise<any> {
    try {
      const { proof, leaf, root, index } = payload;
      
      // Simulate Merkle proof verification
      const isValid = proof && leaf && root && 
                     Array.isArray(proof) && proof.length > 0;

      return {
        isValid,
        leaf,
        root,
        index,
        verifiedAt: new Date(),
        verifierNode: `verifier-${process.pid}`,
      };
    } catch (error: any) {
      logger.error(`Failed to verify Merkle proof: ${error?.message || 'Unknown error'}`, error);
      throw error;
    }
  }
}
