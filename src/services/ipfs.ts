import { config } from '@/config/environment';
import { logger } from '@/utils/logger';

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
      await this.ensureInitialized();
      
      const cid = CID.parse(hash);
      const bytes = await this.fs!.cat(cid);
      
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
      await this.ensureInitialized();
      
      const cid = CID.parse(hash);
      const data = await this.j!.get(cid);
      
      logger.debug(`Downloaded JSON from IPFS: ${hash}`);
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
