import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { BlockchainService } from '@/services/blockchain';

const verifyAnchorSchema = z.object({
  verificationHash: z.string().min(1),
  chains: z.array(z.enum(['ethereum', 'arbitrum', 'starknet'])).optional(),
});

export default async function blockchainRoutes(app: FastifyInstance) {
  const blockchainService = new BlockchainService();

  // Get network information
  app.get('/networks', {
    schema: {
      tags: ['Blockchain'],
      summary: 'Get blockchain network information',
      response: {
        200: {
          type: 'object',
          properties: {
            ethereum: {
              type: 'object',
              nullable: true,
              properties: {
                chainId: { type: 'number' },
                blockNumber: { type: 'number' },
              },
            },
            arbitrum: {
              type: 'object',
              nullable: true,
              properties: {
                chainId: { type: 'number' },
                blockNumber: { type: 'number' },
              },
            },
            starknet: {
              type: 'object',
              nullable: true,
              properties: {
                chainId: { type: 'string' },
                blockNumber: { type: 'number' },
              },
            },
          },
        },
      },
    },
  }, async () => {
    try {
      const networkInfo = await blockchainService.getNetworkInfo();
      return networkInfo;
    } catch (error) {
      app.log.error('Failed to get network info:', error);
      return {};
    }
  });

  // Verify anchor on blockchains
  app.post('/verify-anchor', {
    schema: {
      tags: ['Blockchain'],
      summary: 'Verify if a hash is anchored on blockchains',
      body: {
        type: 'object',
        required: ['verificationHash'],
        properties: {
          verificationHash: { type: 'string', minLength: 1 },
          chains: {
            type: 'array',
            items: { type: 'string', enum: ['ethereum', 'arbitrum', 'starknet'] },
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            verificationHash: { type: 'string' },
            results: {
              type: 'object',
              properties: {
                ethereum: {
                  type: 'object',
                  nullable: true,
                  properties: {
                    anchored: { type: 'boolean' },
                    blockNumber: { type: 'number', nullable: true },
                    error: { type: 'string', nullable: true },
                  },
                },
                arbitrum: {
                  type: 'object',
                  nullable: true,
                  properties: {
                    anchored: { type: 'boolean' },
                    blockNumber: { type: 'number', nullable: true },
                    error: { type: 'string', nullable: true },
                  },
                },
                starknet: {
                  type: 'object',
                  nullable: true,
                  properties: {
                    anchored: { type: 'boolean' },
                    blockNumber: { type: 'number', nullable: true },
                    error: { type: 'string', nullable: true },
                  },
                },
              },
            },
            summary: {
              type: 'object',
              properties: {
                totalChains: { type: 'number' },
                anchoredChains: { type: 'number' },
                isFullyAnchored: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
  }, async (request) => {
    const body = verifyAnchorSchema.parse(request.body);
    const chainsToCheck = body.chains || ['ethereum', 'arbitrum', 'starknet'];

    const results: any = {};
    let anchoredChains = 0;

    // Check each requested chain
    for (const chain of chainsToCheck) {
      try {
        let result;
        switch (chain) {
          case 'ethereum':
            result = await blockchainService.verifyEthereumAnchor(body.verificationHash);
            break;
          case 'arbitrum':
            result = await blockchainService.verifyArbitrumAnchor(body.verificationHash);
            break;
          case 'starknet':
            result = await blockchainService.verifyStarknetAnchor(body.verificationHash);
            break;
          default:
            continue;
        }

        results[chain] = result;
        if (result.anchored) {
          anchoredChains++;
        }
      } catch (error) {
        results[chain] = {
          anchored: false,
          blockNumber: null,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    return {
      verificationHash: body.verificationHash,
      results,
      summary: {
        totalChains: chainsToCheck.length,
        anchoredChains,
        isFullyAnchored: anchoredChains === chainsToCheck.length,
      },
    };
  });

  // Estimate anchoring costs
  app.post('/estimate-costs', {
    schema: {
      tags: ['Blockchain'],
      summary: 'Estimate costs for anchoring a verification hash',
      body: {
        type: 'object',
        required: ['verificationHash'],
        properties: {
          verificationHash: { type: 'string', minLength: 1 },
          chains: {
            type: 'array',
            items: { type: 'string', enum: ['ethereum', 'arbitrum'] },
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            verificationHash: { type: 'string' },
            costs: {
              type: 'object',
              properties: {
                ethereum: {
                  type: 'object',
                  nullable: true,
                  properties: {
                    gasLimit: { type: 'string' },
                    gasPrice: { type: 'string' },
                    cost: { type: 'string' },
                    costInEth: { type: 'string' },
                  },
                },
                arbitrum: {
                  type: 'object',
                  nullable: true,
                  properties: {
                    gasLimit: { type: 'string' },
                    gasPrice: { type: 'string' },
                    cost: { type: 'string' },
                    costInEth: { type: 'string' },
                  },
                },
              },
            },
            totalCostWei: { type: 'string' },
            totalCostEth: { type: 'string' },
          },
        },
      },
    },
  }, async (request) => {
    const { verificationHash, chains = ['ethereum', 'arbitrum'] } = request.body as any;

    try {
      const estimates = await blockchainService.estimateAnchorCosts(verificationHash);
      
      const costs: any = {};
      let totalCostWei = 0n;

      for (const chain of chains) {
        if (estimates[chain as keyof typeof estimates]) {
          const estimate = estimates[chain as keyof typeof estimates]!;
          const costInWei = estimate.cost;
          const costInEth = (Number(costInWei) / 1e18).toFixed(18);

          costs[chain] = {
            gasLimit: estimate.gasLimit.toString(),
            gasPrice: estimate.gasPrice.toString(),
            cost: costInWei.toString(),
            costInEth,
          };

          totalCostWei += costInWei;
        }
      }

      const totalCostEth = (Number(totalCostWei) / 1e18).toFixed(18);

      return {
        verificationHash,
        costs,
        totalCostWei: totalCostWei.toString(),
        totalCostEth,
      };

    } catch (error) {
      app.log.error('Failed to estimate costs:', error);
      return {
        verificationHash,
        costs: {},
        totalCostWei: '0',
        totalCostEth: '0',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Get blockchain statistics
  app.get('/stats', {
    schema: {
      tags: ['Blockchain'],
      summary: 'Get blockchain anchoring statistics',
      response: {
        200: {
          type: 'object',
          properties: {
            totalAnchors: { type: 'number' },
            anchorsByChain: {
              type: 'object',
              properties: {
                ethereum: { type: 'number' },
                arbitrum: { type: 'number' },
                starknet: { type: 'number' },
              },
            },
            recentAnchors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  chainId: { type: 'number' },
                  txHash: { type: 'string' },
                  blockNumber: { type: 'string' },
                  timestamp: { type: 'string' },
                },
              },
            },
            networkStatus: {
              type: 'object',
              properties: {
                ethereum: {
                  type: 'object',
                  properties: {
                    status: { type: 'string' },
                    latestBlock: { type: 'number' },
                  },
                },
                arbitrum: {
                  type: 'object',
                  properties: {
                    status: { type: 'string' },
                    latestBlock: { type: 'number' },
                  },
                },
                starknet: {
                  type: 'object',
                  properties: {
                    status: { type: 'string' },
                    latestBlock: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      },
    },
  }, async () => {
    try {
      // Get network info for status
      const networkInfo = await blockchainService.getNetworkInfo();

      // Mock statistics (in a real implementation, you'd query your database)
      const stats = {
        totalAnchors: 1250,
        anchorsByChain: {
          ethereum: 450,
          arbitrum: 600,
          starknet: 200,
        },
        recentAnchors: [
          {
            chainId: 1,
            txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
            blockNumber: '18500000',
            timestamp: new Date(Date.now() - 300000).toISOString(), // 5 minutes ago
          },
          {
            chainId: 42161,
            txHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
            blockNumber: '150000000',
            timestamp: new Date(Date.now() - 600000).toISOString(), // 10 minutes ago
          },
        ],
        networkStatus: {
          ethereum: {
            status: networkInfo.ethereum ? 'connected' : 'disconnected',
            latestBlock: networkInfo.ethereum?.blockNumber || 0,
          },
          arbitrum: {
            status: networkInfo.arbitrum ? 'connected' : 'disconnected',
            latestBlock: networkInfo.arbitrum?.blockNumber || 0,
          },
          starknet: {
            status: networkInfo.starknet ? 'connected' : 'disconnected',
            latestBlock: networkInfo.starknet?.blockNumber || 0,
          },
        },
      };

      return stats;

    } catch (error) {
      app.log.error('Failed to get blockchain stats:', error);
      return {
        totalAnchors: 0,
        anchorsByChain: { ethereum: 0, arbitrum: 0, starknet: 0 },
        recentAnchors: [],
        networkStatus: {
          ethereum: { status: 'unknown', latestBlock: 0 },
          arbitrum: { status: 'unknown', latestBlock: 0 },
          starknet: { status: 'unknown', latestBlock: 0 },
        },
      };
    }
  });

  // Get supported chains information
  app.get('/chains', {
    schema: {
      tags: ['Blockchain'],
      summary: 'Get supported blockchain chains information',
      response: {
        200: {
          type: 'object',
          properties: {
            supportedChains: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  chainId: { type: 'number' },
                  nativeCurrency: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      symbol: { type: 'string' },
                      decimals: { type: 'number' },
                    },
                  },
                  rpcUrls: { type: 'array', items: { type: 'string' } },
                  blockExplorerUrls: { type: 'array', items: { type: 'string' } },
                  registryContract: { type: 'string', nullable: true },
                  features: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
      },
    },
  }, async () => {
    const supportedChains = [
      {
        id: 'ethereum',
        name: 'Ethereum Mainnet',
        chainId: 1,
        nativeCurrency: {
          name: 'Ether',
          symbol: 'ETH',
          decimals: 18,
        },
        rpcUrls: ['https://mainnet.infura.io/v3/YOUR_KEY'],
        blockExplorerUrls: ['https://etherscan.io'],
        registryContract: process.env.ETHEREUM_REGISTRY_CONTRACT || null,
        features: ['anchoring', 'verification', 'staking'],
      },
      {
        id: 'arbitrum',
        name: 'Arbitrum One',
        chainId: 42161,
        nativeCurrency: {
          name: 'Ether',
          symbol: 'ETH',
          decimals: 18,
        },
        rpcUrls: ['https://arb1.arbitrum.io/rpc'],
        blockExplorerUrls: ['https://arbiscan.io'],
        registryContract: process.env.ARBITRUM_REGISTRY_CONTRACT || null,
        features: ['anchoring', 'verification', 'staking', 'l2-scaling'],
      },
      {
        id: 'starknet',
        name: 'Starknet Mainnet',
        chainId: 0, // Starknet uses different chain identification
        nativeCurrency: {
          name: 'Ether',
          symbol: 'ETH',
          decimals: 18,
        },
        rpcUrls: ['https://starknet-mainnet.infura.io/v3/YOUR_KEY'],
        blockExplorerUrls: ['https://starkscan.co'],
        registryContract: process.env.STARKNET_REGISTRY_CONTRACT || null,
        features: ['anchoring', 'verification', 'stark-proofs', 'cairo'],
      },
    ];

    return { supportedChains };
  });

  // Get contract addresses
  app.get('/contracts', {
    schema: {
      tags: ['Blockchain'],
      summary: 'Get deployed contract addresses',
      response: {
        200: {
          type: 'object',
          properties: {
            contracts: {
              type: 'object',
              properties: {
                ethereum: {
                  type: 'object',
                  properties: {
                    registry: { type: 'string', nullable: true },
                    verifier: { type: 'string', nullable: true },
                    staking: { type: 'string', nullable: true },
                  },
                },
                arbitrum: {
                  type: 'object',
                  properties: {
                    registry: { type: 'string', nullable: true },
                    verifier: { type: 'string', nullable: true },
                    staking: { type: 'string', nullable: true },
                  },
                },
                starknet: {
                  type: 'object',
                  properties: {
                    registry: { type: 'string', nullable: true },
                    verifier: { type: 'string', nullable: true },
                    staking: { type: 'string', nullable: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  }, async () => {
    const contracts = {
      ethereum: {
        registry: process.env.ETHEREUM_REGISTRY_CONTRACT || null,
        verifier: process.env.ETHEREUM_VERIFIER_CONTRACT || null,
        staking: process.env.ETHEREUM_STAKING_CONTRACT || null,
      },
      arbitrum: {
        registry: process.env.ARBITRUM_REGISTRY_CONTRACT || null,
        verifier: process.env.ARBITRUM_VERIFIER_CONTRACT || null,
        staking: process.env.ARBITRUM_STAKING_CONTRACT || null,
      },
      starknet: {
        registry: process.env.STARKNET_REGISTRY_CONTRACT || null,
        verifier: process.env.STARKNET_VERIFIER_CONTRACT || null,
        staking: process.env.STARKNET_STAKING_CONTRACT || null,
      },
    };

    return { contracts };
  });
}
