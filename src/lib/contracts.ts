/**
 * MemeFlow Smart Contract Integration
 * 
 * This module provides TypeScript interfaces and functions for interacting
 * with MemeFlow smart contracts on the Sui blockchain.
 */

import { SuiClient } from '@mysten/sui.js/client';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { fromB64 } from '@mysten/sui.js/utils';

// ===== Types and Interfaces =====

export interface MemeFlowDeployment {
  network: string;
  rpcUrl: string;
  packageId: string;
  factoryId: string;
  deploymentTx: string;
  timestamp: string;
  deployer: string;
}

export interface TokenInfo {
  symbol: string;
  name: string;
  description: string;
  imageUrl: string;
  creator: string;
  totalSupply: string;
  circulatingSupply: string;
  bondingCurveProgress: string;
  tradingEnabled: boolean;
  currentPrice: string;
}

export interface FactoryStats {
  totalTokensCreated: number;
  platformFeesCollected: string;
}

export interface TradePreview {
  inputAmount: string;
  outputAmount: string;
  priceImpact: number;
  fee: string;
  newPrice: string;
}

// ===== Contract Interface Class =====

export class MemeFlowContracts {
  private client: SuiClient;
  private deployment: MemeFlowDeployment;

  constructor(client: SuiClient, deployment: MemeFlowDeployment) {
    this.client = client;
    this.deployment = deployment;
  }

  /**
   * Create a new meme token when user completes registration
   */
  async createUserToken(
    signer: Ed25519Keypair,
    userData: {
      username: string;
      displayName?: string;
      bio?: string;
      avatarUrl?: string;
    },
    creationFeeSui: number = 1 // 1 SUI creation fee
  ): Promise<string> {
    const tx = new TransactionBlock();
    
    // Split SUI for creation fee
    const [feeCoins] = tx.splitCoins(tx.gas, [tx.pure(creationFeeSui * 1_000_000_000)]);
    
    // Call create_user_token function
    tx.moveCall({
      target: `${this.deployment.packageId}::integration::create_user_token`,
      arguments: [
        tx.object(this.deployment.factoryId),
        feeCoins,
        tx.pure(userData.username),
        tx.pure(userData.displayName || ''),
        tx.pure(userData.bio || ''),
        tx.pure(userData.avatarUrl || ''),
        tx.object('0x6'), // Clock object ID
      ],
    });

    // Execute transaction
    const result = await this.client.signAndExecuteTransactionBlock({
      signer,
      transactionBlock: tx,
      options: {
        showEffects: true,
        showEvents: true,
      },
    });

    if (result.effects?.status?.status !== 'success') {
      throw new Error(`Token creation failed: ${result.effects?.status?.error}`);
    }

    return result.digest;
  }

  /**
   * Buy tokens from bonding curve
   */
  async buyTokens(
    signer: Ed25519Keypair,
    symbol: string,
    suiAmount: number,
    minTokensOut: number = 0
  ): Promise<string> {
    const tx = new TransactionBlock();
    
    // Split SUI for purchase
    const [paymentCoins] = tx.splitCoins(tx.gas, [tx.pure(suiAmount * 1_000_000_000)]);
    
    // Call buy_tokens function
    tx.moveCall({
      target: `${this.deployment.packageId}::meme_token_factory::buy_tokens`,
      arguments: [
        tx.object(this.deployment.factoryId),
        tx.pure(symbol),
        paymentCoins,
        tx.pure(minTokensOut),
        tx.object('0x6'), // Clock object ID
      ],
    });

    const result = await this.client.signAndExecuteTransactionBlock({
      signer,
      transactionBlock: tx,
      options: {
        showEffects: true,
        showEvents: true,
      },
    });

    if (result.effects?.status?.status !== 'success') {
      throw new Error(`Token purchase failed: ${result.effects?.status?.error}`);
    }

    return result.digest;
  }

  /**
   * Sell tokens back to bonding curve
   */
  async sellTokens(
    signer: Ed25519Keypair,
    symbol: string,
    tokenAmount: number,
    minSuiOut: number = 0
  ): Promise<string> {
    const tx = new TransactionBlock();
    
    // Call sell_tokens function
    tx.moveCall({
      target: `${this.deployment.packageId}::meme_token_factory::sell_tokens`,
      arguments: [
        tx.object(this.deployment.factoryId),
        tx.pure(symbol),
        tx.pure(tokenAmount),
        tx.pure(minSuiOut),
        tx.object('0x6'), // Clock object ID
      ],
    });

    const result = await this.client.signAndExecuteTransactionBlock({
      signer,
      transactionBlock: tx,
      options: {
        showEffects: true,
        showEvents: true,
      },
    });

    if (result.effects?.status?.status !== 'success') {
      throw new Error(`Token sale failed: ${result.effects?.status?.error}`);
    }

    return result.digest;
  }

  /**
   * Get token information
   */
  async getTokenInfo(symbol: string): Promise<TokenInfo | null> {
    try {
      const result = await this.client.devInspectTransactionBlock({
        transactionBlock: (() => {
          const tx = new TransactionBlock();
          tx.moveCall({
            target: `${this.deployment.packageId}::integration::get_token_for_frontend`,
            arguments: [
              tx.object(this.deployment.factoryId),
              tx.pure(symbol),
            ],
          });
          return tx;
        })(),
        sender: this.deployment.deployer,
      });

      if (result.results?.[0]?.returnValues) {
        const returnValues = result.results[0].returnValues;
        
        return {
          symbol: this.decodeString(returnValues[0]),
          name: this.decodeString(returnValues[1]),
          description: this.decodeString(returnValues[2]),
          imageUrl: this.decodeString(returnValues[3]),
          creator: this.decodeAddress(returnValues[4]),
          totalSupply: this.decodeU64(returnValues[5]),
          circulatingSupply: this.decodeU64(returnValues[6]),
          bondingCurveProgress: this.decodeU64(returnValues[7]),
          tradingEnabled: this.decodeBool(returnValues[8]),
          currentPrice: this.decodeU64(returnValues[9]),
        };
      }

      return null;
    } catch (error) {
      console.error('Error fetching token info:', error);
      return null;
    }
  }

  /**
   * Get factory statistics
   */
  async getFactoryStats(): Promise<FactoryStats | null> {
    try {
      const result = await this.client.devInspectTransactionBlock({
        transactionBlock: (() => {
          const tx = new TransactionBlock();
          tx.moveCall({
            target: `${this.deployment.packageId}::integration::get_factory_overview`,
            arguments: [tx.object(this.deployment.factoryId)],
          });
          return tx;
        })(),
        sender: this.deployment.deployer,
      });

      if (result.results?.[0]?.returnValues) {
        const returnValues = result.results[0].returnValues;
        
        return {
          totalTokensCreated: parseInt(this.decodeU64(returnValues[0])),
          platformFeesCollected: this.decodeU64(returnValues[1]),
        };
      }

      return null;
    } catch (error) {
      console.error('Error fetching factory stats:', error);
      return null;
    }
  }

  /**
   * Check if a token symbol is available
   */
  async isSymbolAvailable(symbol: string): Promise<boolean> {
    try {
      const tokenInfo = await this.getTokenInfo(symbol);
      return tokenInfo === null;
    } catch (error) {
      console.error('Error checking symbol availability:', error);
      return false;
    }
  }

  /**
   * Get token events (creation, trades, etc.)
   */
  async getTokenEvents(symbol: string, limit: number = 20) {
    try {
      const events = await this.client.queryEvents({
        query: {
          MoveModule: {
            package: this.deployment.packageId,
            module: 'meme_token_factory',
          },
        },
        limit,
        order: 'descending',
      });

      return events.data.filter(event => {
        const eventData = event.parsedJson as any;
        return eventData?.symbol === symbol;
      });
    } catch (error) {
      console.error('Error fetching token events:', error);
      return [];
    }
  }

  /**
   * Get all created tokens
   */
  async getAllTokens(limit: number = 100) {
    try {
      const events = await this.client.queryEvents({
        query: {
          MoveEventType: `${this.deployment.packageId}::meme_token_factory::TokenCreated`,
        },
        limit,
        order: 'descending',
      });

      return events.data.map(event => event.parsedJson as any);
    } catch (error) {
      console.error('Error fetching all tokens:', error);
      return [];
    }
  }

  // ===== Private Helper Methods =====

  private decodeString(data: [number, string]): string {
    const bytes = fromB64(data[1]);
    return new TextDecoder().decode(bytes);
  }

  private decodeU64(data: [number, string]): string {
    // Sui returns u64 as string to avoid JavaScript precision issues
    return data[1];
  }

  private decodeAddress(data: [number, string]): string {
    return `0x${data[1]}`;
  }

  private decodeBool(data: [number, string]): boolean {
    return data[1] === '1' || data[1] === 'true';
  }
}

// ===== Utility Functions =====

/**
 * Load deployment configuration from JSON file or config
 */
export async function loadDeployment(network: string): Promise<MemeFlowDeployment> {
  try {
    // First try to load from generated config
    const { DEPLOYMENT_CONFIG, isDeploymentReady } = await import('./config');
    
    if (network in DEPLOYMENT_CONFIG && isDeploymentReady(network as any)) {
      return DEPLOYMENT_CONFIG[network as keyof typeof DEPLOYMENT_CONFIG];
    }
    
    // Fallback to JSON file
    const response = await fetch(`/deployment-${network}.json`);
    if (!response.ok) {
      throw new Error(`Deployment file not found for network: ${network}`);
    }
    return await response.json();
  } catch (error) {
    throw new Error(`Failed to load deployment config: ${error}`);
  }
}

/**
 * Create MemeFlowContracts instance with network configuration
 */
export async function createMemeFlowContracts(
  network: string = 'devnet'
): Promise<MemeFlowContracts> {
  const deployment = await loadDeployment(network);
  const client = new SuiClient({ url: deployment.rpcUrl });
  
  return new MemeFlowContracts(client, deployment);
}

/**
 * Format token amount for display (handle decimals)
 */
export function formatTokenAmount(amount: string, decimals: number = 9): string {
  const num = BigInt(amount);
  const divisor = BigInt(10 ** decimals);
  const whole = num / divisor;
  const fraction = num % divisor;
  
  if (fraction === BigInt(0)) {
    return whole.toString();
  }
  
  const fractionStr = fraction.toString().padStart(decimals, '0');
  const trimmed = fractionStr.replace(/0+$/, '');
  
  return `${whole}.${trimmed}`;
}

/**
 * Parse token amount from user input (handle decimals)
 */
export function parseTokenAmount(amount: string, decimals: number = 9): string {
  const [whole, fraction = ''] = amount.split('.');
  const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
  const result = BigInt(whole + paddedFraction);
  
  return result.toString();
}

/**
 * Calculate price impact for a trade
 */
export function calculatePriceImpact(
  currentPrice: string,
  newPrice: string
): number {
  const current = parseFloat(currentPrice);
  const newPriceNum = parseFloat(newPrice);
  
  if (current === 0) return 0;
  
  return Math.abs((newPriceNum - current) / current) * 100;
}

// ===== Constants =====

export const NETWORKS = {
  LOCAL: 'http://127.0.0.1:9000',
  DEVNET: 'https://fullnode.devnet.sui.io:443',
  TESTNET: 'https://fullnode.testnet.sui.io:443',
  MAINNET: 'https://fullnode.mainnet.sui.io:443',
} as const;

export const TOKEN_CREATION_FEE = 1_000_000_000; // 1 SUI in MIST
export const BONDING_CURVE_TARGET = 69_000_000_000; // 69 SUI target