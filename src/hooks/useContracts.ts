/**
 * React hooks for MemeFlow contract interactions
 */

import { useState, useEffect, useCallback } from 'react';
import { useCurrentWallet } from '@mysten/dapp-kit';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { 
  MemeFlowContracts, 
  createMemeFlowContracts 
} from '../lib/contracts';
import type { TokenInfo, FactoryStats } from '../lib/contracts';
import { useNetwork } from '../contexts/NetworkContext';

// ===== Custom Hooks =====

/**
 * Main hook for contract interactions
 */
export function useContracts(overrideNetwork?: string) {
  const { currentNetwork } = useNetwork();
  // Use override network if provided, otherwise use context network
  const activeNetwork = overrideNetwork || currentNetwork;
  
  const [contracts, setContracts] = useState<MemeFlowContracts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const initContracts = async () => {
      try {
        setLoading(true);
        setError(null);
        
        console.log(`🔗 Initializing contracts for network: ${activeNetwork}`);
        const contractsInstance = await createMemeFlowContracts(activeNetwork);
        
        if (mounted) {
          setContracts(contractsInstance);
          console.log(`✅ Contracts initialized for ${activeNetwork}`);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to initialize contracts');
          console.error('Contract initialization error:', err);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initContracts();

    return () => {
      mounted = false;
    };
  }, [activeNetwork]);

  return { contracts, loading, error, network: activeNetwork };
}

/**
 * Hook for creating meme tokens
 */
export function useCreateToken() {
  const { contracts } = useContracts();
  const { currentWallet } = useCurrentWallet();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createToken = useCallback(async (
    userData: {
      username: string;
      displayName?: string;
      bio?: string;
      avatarUrl?: string;
    },
    creationFee: number = 1
  ) => {
    if (!contracts || !currentWallet?.accounts?.[0]) {
      throw new Error('Wallet not connected or contracts not loaded');
    }

    setCreating(true);
    setError(null);

    try {
      // In a real implementation, you'd get the keypair from the wallet
      // For now, this is a placeholder - you'd need to integrate with wallet signing
      const signer = Ed25519Keypair.generate(); // This should come from wallet
      
      const txHash = await contracts.createUserToken(signer, userData, creationFee);
      
      return {
        success: true,
        transactionHash: txHash,
        tokenSymbol: userData.username.toUpperCase()
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create token';
      setError(errorMessage);
      
      return {
        success: false,
        error: errorMessage
      };
    } finally {
      setCreating(false);
    }
  }, [contracts, currentWallet]);

  return { createToken, creating, error };
}

/**
 * Hook for token information
 */
export function useTokenInfo(symbol: string | null) {
  const { contracts } = useContracts();
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTokenInfo = useCallback(async () => {
    if (!contracts || !symbol) {
      setTokenInfo(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const info = await contracts.getTokenInfo(symbol);
      setTokenInfo(info);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch token info');
      setTokenInfo(null);
    } finally {
      setLoading(false);
    }
  }, [contracts, symbol]);

  useEffect(() => {
    fetchTokenInfo();
  }, [fetchTokenInfo]);

  return { tokenInfo, loading, error, refetch: fetchTokenInfo };
}

/**
 * Hook for factory statistics
 */
export function useFactoryStats() {
  const { contracts } = useContracts();
  const [stats, setStats] = useState<FactoryStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    if (!contracts) {
      setStats(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const factoryStats = await contracts.getFactoryStats();
      setStats(factoryStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch factory stats');
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [contracts]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, loading, error, refetch: fetchStats };
}

/**
 * Hook for token trading
 */
export function useTokenTrading() {
  const { contracts } = useContracts();
  const { currentWallet } = useCurrentWallet();
  const [trading, setTrading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buyTokens = useCallback(async (
    symbol: string,
    suiAmount: number,
    minTokensOut: number = 0
  ) => {
    if (!contracts || !currentWallet?.accounts?.[0]) {
      throw new Error('Wallet not connected or contracts not loaded');
    }

    setTrading(true);
    setError(null);

    try {
      // Placeholder signer - would come from wallet in real implementation
      const signer = Ed25519Keypair.generate();
      
      const txHash = await contracts.buyTokens(signer, symbol, suiAmount, minTokensOut);
      
      return {
        success: true,
        transactionHash: txHash
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to buy tokens';
      setError(errorMessage);
      
      return {
        success: false,
        error: errorMessage
      };
    } finally {
      setTrading(false);
    }
  }, [contracts, currentWallet]);

  const sellTokens = useCallback(async (
    symbol: string,
    tokenAmount: number,
    minSuiOut: number = 0
  ) => {
    if (!contracts || !currentWallet?.accounts?.[0]) {
      throw new Error('Wallet not connected or contracts not loaded');
    }

    setTrading(true);
    setError(null);

    try {
      // Placeholder signer - would come from wallet in real implementation
      const signer = Ed25519Keypair.generate();
      
      const txHash = await contracts.sellTokens(signer, symbol, tokenAmount, minSuiOut);
      
      return {
        success: true,
        transactionHash: txHash
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to sell tokens';
      setError(errorMessage);
      
      return {
        success: false,
        error: errorMessage
      };
    } finally {
      setTrading(false);
    }
  }, [contracts, currentWallet]);

  return { buyTokens, sellTokens, trading, error };
}

/**
 * Hook for checking symbol availability
 */
export function useSymbolAvailability() {
  const { contracts } = useContracts();
  const [checking, setChecking] = useState(false);

  const checkSymbol = useCallback(async (symbol: string) => {
    if (!contracts || !symbol) {
      return { available: false, checking: false };
    }

    setChecking(true);
    
    try {
      const available = await contracts.isSymbolAvailable(symbol.toUpperCase());
      return { available, checking: false };
    } catch (error) {
      console.error('Error checking symbol availability:', error);
      return { available: false, checking: false };
    } finally {
      setChecking(false);
    }
  }, [contracts]);

  return { checkSymbol, checking };
}

/**
 * Hook for token events and activity
 */
export function useTokenActivity(symbol: string | null) {
  const { contracts } = useContracts();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    if (!contracts || !symbol) {
      setEvents([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const tokenEvents = await contracts.getTokenEvents(symbol);
      setEvents(tokenEvents);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch token events');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [contracts, symbol]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  return { events, loading, error, refetch: fetchEvents };
}

/**
 * Hook for all tokens list
 */
export function useAllTokens() {
  const { contracts } = useContracts();
  const [tokens, setTokens] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAllTokens = useCallback(async () => {
    if (!contracts) {
      setTokens([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const allTokens = await contracts.getAllTokens();
      setTokens(allTokens);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tokens');
      setTokens([]);
    } finally {
      setLoading(false);
    }
  }, [contracts]);

  useEffect(() => {
    fetchAllTokens();
  }, [fetchAllTokens]);

  return { tokens, loading, error, refetch: fetchAllTokens };
}