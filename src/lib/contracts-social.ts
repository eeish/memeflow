/**
 * Cord Social Contract Integration
 * 
 * This module provides TypeScript interfaces and functions for interacting
 * with Cord social contracts on the Sui blockchain.
 */

import { SuiClient } from '@mysten/sui.js/client';
import { TransactionBlock } from '@mysten/sui.js/transactions';

// ===== Types and Interfaces =====

export interface CordDeployment {
  network: string;
  rpcUrl: string;
  packageId: string;
  profileRegistryId: string;
  factoryId: string;
  deploymentTx: string;
  timestamp: string;
  deployer: string;
}

export interface SocialProfile {
  address: string;
  username: string;
  bio: string;
  avatarUrl: string;
  followerCount: number;
  followingCount: number;
  sponsorLeft: number;
  createdAt: string;
}

// ===== Utility Functions =====

/**
 * Load deployment configuration from JSON file or environment
 */
export async function loadDeployment(network: string): Promise<CordDeployment | null> {
  try {
    // Try to load from public deployment file
    const response = await fetch(`/deployment-${network}.json`);
    if (!response.ok) {
      console.warn(`Deployment file not found for network: ${network}`);
      
      // Fallback to environment variables
      const packageId = import.meta.env.VITE_PACKAGE_ID;
      const profileRegistryId = import.meta.env.VITE_PROFILE_REGISTRY_ID;
      const factoryId = import.meta.env.VITE_FACTORY_ID;
      
      if (packageId && profileRegistryId) {
        return {
          network,
          rpcUrl: network === 'devnet' 
            ? 'https://fullnode.devnet.sui.io:443'
            : 'https://fullnode.testnet.sui.io:443',
          packageId,
          profileRegistryId,
          factoryId: factoryId || '',
          deploymentTx: '',
          timestamp: new Date().toISOString(),
          deployer: ''
        };
      }
      
      return null;
    }
    
    const data = await response.json();
    return {
      ...data,
      profileRegistryId: data.profileRegistryId || data.profileRegistryId,
      factoryId: data.factoryId || data.factory_id || ''
    };
  } catch (error) {
    console.error(`Failed to load deployment config:`, error);
    return null;
  }
}

// ===== Constants =====

export const NETWORKS = {
  LOCAL: 'http://127.0.0.1:9000',
  DEVNET: 'https://fullnode.devnet.sui.io:443',
  TESTNET: 'https://fullnode.testnet.sui.io:443',
  MAINNET: 'https://fullnode.mainnet.sui.io:443',
} as const;