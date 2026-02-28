/**
 * Cord Social Contract Integration
 * 
 * This module provides TypeScript interfaces and functions for interacting
 * with Cord social contracts on the Sui blockchain.
 */
// ===== Types and Interfaces =====

export interface CordDeployment {
  network: string;
  rpcUrl: string;
  packageId: string;
  /** Original package ID from first deployment - use for querying existing objects */
  originalPackageId?: string;
  /** UpgradeCap object ID - required for future upgrades */
  upgradeCapId?: string;
  /** Shared GraduationRegistry object ID for Phase 2 launch transactions */
  graduationRegistryId?: string;
  /** Maximum holder slots in Phase 1 market. */
  maxSupply?: number;
  /** Holders threshold required to launch (derived from maxSupply). */
  graduationThreshold?: number;
  profileRegistryId: string;
  factoryId: string;
  deploymentTx: string;
  timestamp: string;
  deployer: string;
  /** Number of times the package has been upgraded */
  upgradeCount?: number;
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

function parseMaxSupply(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 2;
  const normalized = Math.floor(parsed);
  if (normalized < 2) return 2;
  return normalized;
}

// ===== Utility Functions =====

/**
 * Load deployment configuration from JSON file or environment
 */
export async function loadDeployment(network: string): Promise<CordDeployment | null> {
  try {
    // Try to load from public deployment file
    const cacheBuster = Date.now();
    const response = await fetch(`/deployment-${network}.json?ts=${cacheBuster}`, {
      cache: 'no-store',
    });
    if (!response.ok) {
      console.warn(`Deployment file not found for network: ${network}`);
      return null;
    }
    
    const data = await response.json();
    const maxSupply = parseMaxSupply(data.maxSupply ?? data.max_supply);
    return {
      ...data,
      // Use originalPackageId if available (for upgraded packages), otherwise use packageId
      originalPackageId: data.originalPackageId || data.packageId,
      graduationRegistryId: data.graduationRegistryId || data.graduation_registry_id || '',
      maxSupply,
      graduationThreshold: maxSupply,
      profileRegistryId: data.profileRegistryId || data.profile_registry_id,
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
