import { ethers } from 'ethers';
import { Account, RpcProvider } from 'starknet';
import { config } from '@/config/environment';
import { logger } from '@/utils/logger';

export class BlockchainService {
  private ethereumProvider?: ethers.JsonRpcProvider;
  private arbitrumProvider?: ethers.JsonRpcProvider;
  private starknetProvider?: RpcProvider;

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders(): void {
    try {
      if (config.ETHEREUM_RPC_URL) {
        this.ethereumProvider = new ethers.JsonRpcProvider(config.ETHEREUM_RPC_URL);
      }

      if (config.ARBITRUM_RPC_URL) {
        this.arbitrumProvider = new ethers.JsonRpcProvider(config.ARBITRUM_RPC_URL);
      }

      if (config.STARKNET_RPC_URL) {
        this.starknetProvider = new RpcProvider({ nodeUrl: config.STARKNET_RPC_URL });
      }
    } catch (error) {
      logger.error('Failed to initialize blockchain providers:', error);
    }
  }

  /**
   * Anchor verification hash to Ethereum
   */
  async anchorToEthereum(verificationHash: string): Promise<string> {
    if (!this.ethereumProvider || !config.ETHEREUM_PRIVATE_KEY || !config.ETHEREUM_REGISTRY_CONTRACT) {
      throw new Error('Ethereum configuration not available');
    }

    try {
      const wallet = new ethers.Wallet(config.ETHEREUM_PRIVATE_KEY, this.ethereumProvider);
      
      // Simple contract ABI for anchoring
      const contractABI = [
        'function anchor(bytes32 hash) external returns (bool)',
        'function getAnchor(bytes32 hash) external view returns (uint256)',
      ];

      const contract = new ethers.Contract(
        config.ETHEREUM_REGISTRY_CONTRACT,
        contractABI,
        wallet
      );

      // Convert hash to bytes32
      const hashBytes32 = ethers.keccak256(ethers.toUtf8Bytes(verificationHash));

      // Send transaction
      if (!contract?.anchor) throw new Error("Contract anchor method not available");
      const tx = await contract.anchor(hashBytes32);
      await tx.wait();

      logger.info(`Anchored to Ethereum: ${tx.hash}`);
      return tx.hash;

    } catch (error) {
      logger.error('Ethereum anchoring failed:', error);
      throw new Error(`Ethereum anchoring failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Anchor verification hash to Arbitrum
   */
  async anchorToArbitrum(verificationHash: string): Promise<string> {
    if (!this.arbitrumProvider || !config.ARBITRUM_PRIVATE_KEY || !config.ARBITRUM_REGISTRY_CONTRACT) {
      throw new Error('Arbitrum configuration not available');
    }

    try {
      const wallet = new ethers.Wallet(config.ARBITRUM_PRIVATE_KEY, this.arbitrumProvider);
      
      const contractABI = [
        'function anchor(bytes32 hash) external returns (bool)',
        'function getAnchor(bytes32 hash) external view returns (uint256)',
      ];

      const contract = new ethers.Contract(
        config.ARBITRUM_REGISTRY_CONTRACT,
        contractABI,
        wallet
      );

      const hashBytes32 = ethers.keccak256(ethers.toUtf8Bytes(verificationHash));
      if (!contract?.anchor) throw new Error("Contract anchor method not available");
      const tx = await contract.anchor(hashBytes32);
      await tx.wait();

      logger.info(`Anchored to Arbitrum: ${tx.hash}`);
      return tx.hash;

    } catch (error) {
      logger.error('Arbitrum anchoring failed:', error);
      throw new Error(`Arbitrum anchoring failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Anchor verification hash to Starknet
   */
  async anchorToStarknet(verificationHash: string): Promise<string> {
    if (!this.starknetProvider || !config.STARKNET_PRIVATE_KEY || !config.STARKNET_REGISTRY_CONTRACT) {
      throw new Error('Starknet configuration not available');
    }

    try {
      const account = new Account(
        this.starknetProvider,
        config.STARKNET_REGISTRY_CONTRACT,
        config.STARKNET_PRIVATE_KEY
      );

      // Convert hash to felt (Starknet's field element)
      const hashFelt = ethers.keccak256(ethers.toUtf8Bytes(verificationHash));

      // Call anchor function
      const result = await account.execute({
        contractAddress: config.STARKNET_REGISTRY_CONTRACT,
        entrypoint: 'anchor',
        calldata: [hashFelt],
      });

      logger.info(`Anchored to Starknet: ${result.transaction_hash}`);
      return result.transaction_hash;

    } catch (error) {
      logger.error('Starknet anchoring failed:', error);
      throw new Error(`Starknet anchoring failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Verify if a hash is anchored on Ethereum
   */
  async verifyEthereumAnchor(verificationHash: string): Promise<{ anchored: boolean; blockNumber?: number }> {
    if (!this.ethereumProvider || !config.ETHEREUM_REGISTRY_CONTRACT) {
      throw new Error('Ethereum configuration not available');
    }

    try {
      const contractABI = [
        'function getAnchor(bytes32 hash) external view returns (uint256)',
      ];

      const contract = new ethers.Contract(
        config.ETHEREUM_REGISTRY_CONTRACT,
        contractABI,
        this.ethereumProvider
      );

      const hashBytes32 = ethers.keccak256(ethers.toUtf8Bytes(verificationHash));
      if (!contract?.getAnchor) throw new Error("Contract getAnchor method not available");
      const blockNumber = await contract.getAnchor(hashBytes32);

      return {
        anchored: blockNumber > 0,
        ...(blockNumber > 0 && { blockNumber: Number(blockNumber) }),
      };

    } catch (error) {
      logger.error('Ethereum anchor verification failed:', error);
      return { anchored: false };
    }
  }

  /**
   * Verify if a hash is anchored on Arbitrum
   */
  async verifyArbitrumAnchor(verificationHash: string): Promise<{ anchored: boolean; blockNumber?: number }> {
    if (!this.arbitrumProvider || !config.ARBITRUM_REGISTRY_CONTRACT) {
      throw new Error('Arbitrum configuration not available');
    }

    try {
      const contractABI = [
        'function getAnchor(bytes32 hash) external view returns (uint256)',
      ];

      const contract = new ethers.Contract(
        config.ARBITRUM_REGISTRY_CONTRACT,
        contractABI,
        this.arbitrumProvider
      );

      const hashBytes32 = ethers.keccak256(ethers.toUtf8Bytes(verificationHash));
      if (!contract?.getAnchor) throw new Error("Contract getAnchor method not available");
      const blockNumber = await contract.getAnchor(hashBytes32);

      return {
        anchored: blockNumber > 0,
        ...(blockNumber > 0 && { blockNumber: Number(blockNumber) }),
      };

    } catch (error) {
      logger.error('Arbitrum anchor verification failed:', error);
      return { anchored: false };
    }
  }

  /**
   * Verify if a hash is anchored on Starknet
   */
  async verifyStarknetAnchor(verificationHash: string): Promise<{ anchored: boolean; blockNumber?: number }> {
    if (!this.starknetProvider || !config.STARKNET_REGISTRY_CONTRACT) {
      throw new Error('Starknet configuration not available');
    }

    try {
      const hashFelt = ethers.keccak256(ethers.toUtf8Bytes(verificationHash));

      const result = await this.starknetProvider.callContract({
        contractAddress: config.STARKNET_REGISTRY_CONTRACT,
        entrypoint: 'get_anchor',
        calldata: [hashFelt],
      });

      const blockNumber = parseInt(result.result?.[0] || '0', 16);

      return {
        anchored: blockNumber > 0,
        ...(blockNumber > 0 && { blockNumber }),
      };

    } catch (error) {
      logger.error('Starknet anchor verification failed:', error);
      return { anchored: false };
    }
  }

  /**
   * Get network information
   */
  async getNetworkInfo(): Promise<{
    ethereum?: { chainId: number; blockNumber: number };
    arbitrum?: { chainId: number; blockNumber: number };
    starknet?: { chainId: string; blockNumber: number };
  }> {
    const info: any = {};

    try {
      if (this.ethereumProvider) {
        const network = await this.ethereumProvider.getNetwork();
        const blockNumber = await this.ethereumProvider.getBlockNumber();
        info.ethereum = { chainId: Number(network.chainId), blockNumber };
      }

      if (this.arbitrumProvider) {
        const network = await this.arbitrumProvider.getNetwork();
        const blockNumber = await this.arbitrumProvider.getBlockNumber();
        info.arbitrum = { chainId: Number(network.chainId), blockNumber };
      }

      if (this.starknetProvider) {
        const chainId = await this.starknetProvider.getChainId();
        const blockNumber = await this.starknetProvider.getBlockNumber();
        info.starknet = { chainId, blockNumber };
      }
    } catch (error) {
      logger.error('Failed to get network info:', error);
    }

    return info;
  }

  /**
   * Estimate gas costs for anchoring
   */
  async estimateAnchorCosts(verificationHash: string): Promise<{
    ethereum?: { gasLimit: bigint; gasPrice: bigint; cost: bigint };
    arbitrum?: { gasLimit: bigint; gasPrice: bigint; cost: bigint };
  }> {
    const costs: any = {};

    try {
      if (this.ethereumProvider && config.ETHEREUM_REGISTRY_CONTRACT) {
        const contractABI = ['function anchor(bytes32 hash) external returns (bool)'];
        const contract = new ethers.Contract(
          config.ETHEREUM_REGISTRY_CONTRACT,
          contractABI,
          this.ethereumProvider
        );

        const hashBytes32 = ethers.keccak256(ethers.toUtf8Bytes(verificationHash));
        if (!contract?.anchor) throw new Error("Contract anchor method not available");
        const gasLimit = await contract.anchor.estimateGas(hashBytes32);
        const feeData = await this.ethereumProvider.getFeeData();
        const gasPrice = feeData.gasPrice || 0n;
        
        costs.ethereum = {
          gasLimit,
          gasPrice,
          cost: gasLimit * gasPrice,
        };
      }

      if (this.arbitrumProvider && config.ARBITRUM_REGISTRY_CONTRACT) {
        const contractABI = ['function anchor(bytes32 hash) external returns (bool)'];
        const contract = new ethers.Contract(
          config.ARBITRUM_REGISTRY_CONTRACT,
          contractABI,
          this.arbitrumProvider
        );

        const hashBytes32 = ethers.keccak256(ethers.toUtf8Bytes(verificationHash));
        if (!contract?.anchor) throw new Error("Contract anchor method not available");
        const gasLimit = await contract.anchor.estimateGas(hashBytes32);
        const feeData = await this.arbitrumProvider.getFeeData();
        const gasPrice = feeData.gasPrice || 0n;
        
        costs.arbitrum = {
          gasLimit,
          gasPrice,
          cost: gasLimit * gasPrice,
        };
      }
    } catch (error) {
      logger.error('Failed to estimate anchor costs:', error);
    }

    return costs;
  }
}
