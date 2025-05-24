import { create as createIPFS, IPFSHTTPClient } from 'ipfs-http-client';
import { config } from '@/config/environment';
import { logger } from '@/utils/logger';
import { CID } from 'multiformats/cid';

export class IPFSService {
  private client: IPFSHTTPClient;

  constructor() {
    this.client = createIPFS({
      url: config.IPFS_API_URL,
    });
  }

  /**
   * Upload a file to IPFS
   */
  async uploadFile(buffer: Buffer, filename: string): Promise<string> {
    try {
      const result = await this.client.add(buffer);
      logger.info(`File uploaded to IPFS: ${filename} -> ${result.cid.toString()}`);
      return result.cid.toString();
    } catch (error) {
      logger.error('IPFS upload failed:', error);
      throw new Error('Failed to upload file to IPFS');
    }
  }

  /**
   * Upload JSON data to IPFS
   */
  async uploadJSON(data: any, filename: string = 'data.json'): Promise<string> {
    try {
      const buffer = Buffer.from(JSON.stringify(data, null, 2));
      return await this.uploadFile(buffer, filename);
    } catch (error) {
      logger.error('IPFS JSON upload failed:', error);
      throw new Error('Failed to upload JSON to IPFS');
    }
  }

  /**
   * Upload a directory to IPFS
   */
  async uploadDirectory(files: { path: string; content: Buffer }[]): Promise<string> {
    try {
      const results = [];
      for await (const result of this.client.addAll(files)) {
        results.push(result);
      }

      // Return the root directory hash
      const rootResult = results.find(r => r.path === '');
      if (!rootResult) {
        throw new Error('Failed to get root directory hash');
      }

      logger.info(`Directory uploaded to IPFS: ${rootResult.cid.toString()}`);
      return rootResult.cid.toString();
    } catch (error) {
      logger.error('IPFS directory upload failed:', error);
      throw new Error('Failed to upload directory to IPFS');
    }
  }

  /**
   * Download a file from IPFS
   */
  async downloadFile(hash: string): Promise<Buffer> {
    try {
      const chunks = [];
      for await (const chunk of this.client.cat(hash)) {
        chunks.push(chunk);
      }

      const buffer = Buffer.concat(chunks);
      logger.debug(`Downloaded file from IPFS: ${hash} (${buffer.length} bytes)`);
      return buffer;
    } catch (error) {
      logger.error(`IPFS download failed for hash ${hash}:`, error);
      throw new Error('Failed to download file from IPFS');
    }
  }

  /**
   * Download and parse JSON from IPFS
   */
  async downloadJSON(hash: string): Promise<any> {
    try {
      const buffer = await this.downloadFile(hash);
      const data = JSON.parse(buffer.toString('utf-8'));
      return data;
    } catch (error) {
      logger.error(`IPFS JSON download failed for hash ${hash}:`, error);
      throw new Error('Failed to download JSON from IPFS');
    }
  }

  /**
   * Pin a file to ensure it stays available
   */
  async pinFile(hash: string): Promise<void> {
    try {
      await this.client.pin.add(hash);
      logger.info(`Pinned file to IPFS: ${hash}`);
    } catch (error) {
      logger.error(`IPFS pin failed for hash ${hash}:`, error);
      throw new Error('Failed to pin file to IPFS');
    }
  }

  /**
   * Unpin a file
   */
  async unpinFile(hash: string): Promise<void> {
    try {
      await this.client.pin.rm(hash);
      logger.info(`Unpinned file from IPFS: ${hash}`);
    } catch (error) {
      logger.error(`IPFS unpin failed for hash ${hash}:`, error);
      throw new Error('Failed to unpin file from IPFS');
    }
  }

  /**
   * Check if a file exists on IPFS
   */
  async exists(hash: string): Promise<boolean> {
    try {
      const cid = CID.parse(hash);
      const stat = await this.client.object.stat(cid);
      return stat.Hash.toString() === hash;
    } catch (error: any) {
      logger.error(`IPFS exists check failed for hash ${hash}:`, error);
      return false;
    }
  }

  /**
   * Get file statistics
   */
  async getFileStats(hash: string): Promise<{ size: number; hash: string }> {
    try {
      const cid = CID.parse(hash);
      const stat = await this.client.object.stat(cid);
      return {
        size: stat.CumulativeSize,
        hash: stat.Hash.toString(),
      };
    } catch (error: any) {
      logger.error(`IPFS stat failed for hash ${hash}:`, error);
      throw new Error(`Failed to get file stats for hash: ${hash}`);
    }
  }

  /**
   * Generate IPFS gateway URL
   */
  getGatewayUrl(hash: string): string {
    return `${config.IPFS_GATEWAY_URL}/ipfs/${hash}`;
  }

  /**
   * Validate IPFS hash format
   */
  isValidHash(hash: string): boolean {
    // Basic validation for IPFS hash format
    return /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(hash) || 
           /^baf[a-z0-9]{56}$/.test(hash) ||
           /^bafy[a-z0-9]{56}$/.test(hash);
  }

  /**
   * Get file information
   */
  async getFileInfo(hash: string): Promise<{ size: number; hash: string }> {
    try {
      const cid = CID.parse(hash);
      const stat = await this.client.object.stat(cid);
      return {
        size: stat.CumulativeSize,
        hash: stat.Hash.toString(),
      };
    } catch (error) {
      logger.error(`IPFS stat failed for hash ${hash}:`, error);
      throw new Error(`Failed to get file info for hash: ${hash}`);
    }
  }
}
