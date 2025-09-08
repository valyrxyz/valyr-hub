/**
 * IPFS Gateway Configuration
 * Provides fallback gateways for improved reliability
 */

export interface IPFSGateway {
  url: string;
  name: string;
  timeout: number;
  priority: number; // Lower number = higher priority
}

export const IPFS_GATEWAYS: IPFSGateway[] = [
  {
    url: 'https://ipfs.io/ipfs/',
    name: 'IPFS.io',
    timeout: 10000,
    priority: 1,
  },
  {
    url: 'https://gateway.pinata.cloud/ipfs/',
    name: 'Pinata',
    timeout: 8000,
    priority: 2,
  },
  {
    url: 'https://cloudflare-ipfs.com/ipfs/',
    name: 'Cloudflare',
    timeout: 8000,
    priority: 3,
  },
  {
    url: 'https://dweb.link/ipfs/',
    name: 'Protocol Labs',
    timeout: 12000,
    priority: 4,
  },
  {
    url: 'https://ipfs.infura.io/ipfs/',
    name: 'Infura',
    timeout: 10000,
    priority: 5,
  },
];

/**
 * Get gateways sorted by priority
 */
export function getOrderedGateways(): IPFSGateway[] {
  return [...IPFS_GATEWAYS].sort((a, b) => a.priority - b.priority);
}

/**
 * Get a specific gateway by name
 */
export function getGatewayByName(name: string): IPFSGateway | undefined {
  return IPFS_GATEWAYS.find(gateway => gateway.name === name);
}
