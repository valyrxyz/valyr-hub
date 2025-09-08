import { config } from '@/config/environment';
import { logger } from '@/utils/logger';
import { getOrderedGateways, IPFSGateway } from '@/config/ipfs-gateways';
import { withRetry, RetryableError } from '@/utils/retry';
import { cacheService } from '@/services/redis';
import crypto from 'crypto';

// Use dynamic imports for ESM modules
let createHelia: any;
let unixfs: any;
let json: any;
let CID: any;

// Types for better IDE support
type Helia = any;
type UnixFS = any;
type HeliaJSON = any;

export class IPFSService {
  private helia: Helia | null = null;
  private fs: UnixFS | null = null;
  private j: HeliaJSON | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      logger.info('Initializing Helia IPFS node...');
      
      // Dynamic imports for ESM modules
      if (!createHelia) {
        const heliaModule = await import('helia');
        createHelia = heliaModule.createHelia;
        
        const unixfsModule = await import('@helia/unixfs');
        unixfs = unixfsModule.unixfs;
        
        const jsonModule = await import('@helia/json');
        json = jsonModule.json;
        
        const multiformatsModule = await import('multiformats/cid');
        CID = multiformatsModule.CID;
      }
      
      this.helia = await createHelia({
        libp2p: {
          addresses: {
            listen: []
          }
        }
      });

      this.fs = unixfs(this.helia);
      this.j = json(this.helia);
      this.initialized = true;

      logger.info('Helia IPFS node initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Helia IPFS node:', error);
      throw new Error('Failed to initialize IPFS service');
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Upload a file to IPFS
   */
  async uploadFile(buffer: Buffer, filename: string): Promise<string> {
    try {
      await this.ensureInitialized();
      
      const cid = await this.fs!.addBytes(new Uint8Array(buffer));
      const hash = cid.toString();
      
      logger.info(`File uploaded to IPFS: ${filename} -> ${hash}`);
      return hash;
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
      await this.ensureInitialized();
      
      const cid = await this.j!.add(data);
      const hash = cid.toString();
      
      logger.info(`JSON uploaded to IPFS: ${filename} -> ${hash}`);
      return hash;
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
      await this.ensureInitialized();
      
      // Use addAll for directory creation with multiple files
      const entries = files.map(file => ({
        path: file.path,
        content: new Uint8Array(file.content)
      }));

      let rootCid: any;
      for await (const entry of this.fs!.addAll(entries)) {
        rootCid = entry.cid;
      }

      const hash = rootCid.toString();
      logger.info(`Directory uploaded to IPFS: ${hash}`);
      return hash;
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
      // Try Helia first if available
      await this.ensureInitialized();
      
      if (this.fs) {
        const cid = CID.parse(hash);
        const bytes = await this.fs.cat(cid);
        
        const chunks: Uint8Array[] = [];
        for await (const chunk of bytes) {
          chunks.push(chunk);
        }
        
        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        
        for (const chunk of chunks) {
          result.set(chunk, offset);
          offset += chunk.length;
        }
        
        const buffer = Buffer.from(result);
        logger.debug(`Downloaded file from IPFS via Helia: ${hash} (${buffer.length} bytes)`);
        return buffer;
      }
    } catch (error) {
      logger.warn(`Helia download failed for ${hash}, falling back to gateways:`, error);
    }
    
    // Fallback to gateway download
    return this.downloadFileWithFallback(hash);
  }

  /**
   * Download and parse JSON from IPFS
   */
  async downloadJSON(hash: string): Promise<any> {
    try {
      // Try Helia first if available
      await this.ensureInitialized();
      
      if (this.j) {
        const cid = CID.parse(hash);
        const data = await this.j.get(cid);
        
        logger.debug(`Downloaded JSON from IPFS via Helia: ${hash}`);
        return data;
      }
    } catch (error) {
      logger.warn(`Helia JSON download failed for ${hash}, falling back to gateways:`, error);
    }
    
    // Fallback to gateway download
    return this.downloadJSONWithFallback(hash);
  }

  /**
   * Pin a file to ensure it stays available
   */
  async pinFile(hash: string): Promise<void> {
    try {
      await this.ensureInitialized();
      
      const cid = CID.parse(hash);
      await this.helia!.pins.add(cid);
      
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
      await this.ensureInitialized();
      
      const cid = CID.parse(hash);
      await this.helia!.pins.rm(cid);
      
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
      await this.ensureInitialized();
      
      const cid = CID.parse(hash);
      const stat = await this.fs!.stat(cid);
      return stat.cid.toString() === hash;
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
      await this.ensureInitialized();
      
      const cid = CID.parse(hash);
      const stat = await this.fs!.stat(cid);
      
      return {
        size: Number(stat.fileSize || stat.dagSize || 0),
        hash: stat.cid.toString(),
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
    try {
      CID.parse(hash);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file information
   */
  async getFileInfo(hash: string): Promise<{ size: number; hash: string }> {
    return this.getFileStats(hash);
  }

  /**
   * Generate cache key for IPFS content
   */
  private generateCacheKey(hash: string, type: 'file' | 'json'): string {
    return `ipfs_${type}:${hash}`;
  }

  /**
   * Get cached content
   */
  private async getCachedContent(hash: string, type: 'file' | 'json'): Promise<any | null> {
    try {
      const cacheKey = this.generateCacheKey(hash, type);
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info(`Using cached IPFS content for ${hash}`);
        return type === 'json' ? JSON.parse(cached) : Buffer.from(cached, 'base64');
      }
    } catch (error) {
      logger.warn(`Failed to retrieve cached IPFS content for ${hash}:`, error);
    }
    return null;
  }

  /**
   * Cache content
   */
  private async cacheContent(hash: string, type: 'file' | 'json', content: any): Promise<void> {
    try {
      const cacheKey = this.generateCacheKey(hash, type);
      const cacheValue = type === 'json' ? JSON.stringify(content) : content.toString('base64');
      // Cache for 1 hour
      await cacheService.setex(cacheKey, 3600, cacheValue);
      logger.info(`Cached IPFS content for ${hash}`);
    } catch (error) {
      logger.warn(`Failed to cache IPFS content for ${hash}:`, error);
    }
  }

  /**
   * Download file using gateway fallback
   */
  async downloadFileWithFallback(hash: string): Promise<Buffer> {
    // Check cache first
    const cached = await this.getCachedContent(hash, 'file');
    if (cached) {
      return cached;
    }

    const gateways = getOrderedGateways();
    let lastError: Error | null = null;

    for (const gateway of gateways) {
      try {
        logger.info(`Attempting to download ${hash} from ${gateway.name}`);
        
        const response = await withRetry(
          async () => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), gateway.timeout);
            
            try {
              const res = await fetch(`${gateway.url}${hash}`, {
                signal: controller.signal,
              });
              
              if (!res.ok) {
                throw new RetryableError(`HTTP ${res.status}: ${res.statusText}`);
              }
              
              return res;
            } finally {
              clearTimeout(timeoutId);
            }
          },
          { maxAttempts: 2, baseDelay: 1000 },
          `${gateway.name} download`
        );

        const buffer = Buffer.from(await response.arrayBuffer());
        
        // Validate content hash
        const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');
        logger.info(`Downloaded ${hash} from ${gateway.name} (${buffer.length} bytes)`);
        
        // Cache the result
        await this.cacheContent(hash, 'file', buffer);
        
        return buffer;
      } catch (error: any) {
        lastError = error;
        logger.warn(`Failed to download ${hash} from ${gateway.name}:`, error.message);
        continue;
      }
    }

    throw new Error(`Failed to download ${hash} from all gateways. Last error: ${lastError?.message}`);
  }

  /**
   * Download JSON using gateway fallback
   */
  async downloadJSONWithFallback(hash: string): Promise<any> {
    // Check cache first
    const cached = await this.getCachedContent(hash, 'json');
    if (cached) {
      return cached;
    }

    const gateways = getOrderedGateways();
    let lastError: Error | null = null;

    for (const gateway of gateways) {
      try {
        logger.info(`Attempting to download JSON ${hash} from ${gateway.name}`);
        
        const response = await withRetry(
          async () => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), gateway.timeout);
            
            try {
              const res = await fetch(`${gateway.url}${hash}`, {
                signal: controller.signal,
              });
              
              if (!res.ok) {
                throw new RetryableError(`HTTP ${res.status}: ${res.statusText}`);
              }
              
              return res;
            } finally {
              clearTimeout(timeoutId);
            }
          },
          { maxAttempts: 2, baseDelay: 1000 },
          `${gateway.name} JSON download`
        );

        const jsonData = await response.json();
        logger.info(`Downloaded JSON ${hash} from ${gateway.name}`);
        
        // Cache the result
        await this.cacheContent(hash, 'json', jsonData);
        
        return jsonData;
      } catch (error: any) {
        lastError = error;
        logger.warn(`Failed to download JSON ${hash} from ${gateway.name}:`, error.message);
        continue;
      }
    }

    throw new Error(`Failed to download JSON ${hash} from all gateways. Last error: ${lastError?.message}`);
  }
  /**
   * Stop the Helia node
   */
  async stop(): Promise<void> {
    try {
      if (this.helia) {
        await this.helia.stop();
        this.helia = null;
        this.fs = null;
        this.j = null;
        this.initialized = false;
        logger.info('Helia IPFS node stopped');
      }
    } catch (error) {
      logger.error('Error stopping Helia IPFS node:', error);
    }
  }
}
