// Sui Network Configuration and Types
export type SuiNetworkName = 'localnet' | 'devnet' | 'testnet' | 'mainnet';

export interface SuiNetworkConfig {
  name: SuiNetworkName;
  displayName: string;
  rpcUrl: string;
  faucetUrl?: string;
  explorerUrl: string;
  color: string;
  icon: string;
  description: string;
}

// Sui Network Configurations
export const SUI_NETWORKS: Record<SuiNetworkName, SuiNetworkConfig> = {
  localnet: {
    name: 'localnet',
    displayName: 'Local Network',
    rpcUrl: 'http://127.0.0.1:9000',
    faucetUrl: 'http://127.0.0.1:9123/gas',
    explorerUrl: 'http://127.0.0.1:9001',
    color: '#10B981', // emerald-500
    icon: '🏠',
    description: 'Local development network'
  },
  devnet: {
    name: 'devnet',
    displayName: 'Devnet',
    rpcUrl: 'https://fullnode.devnet.sui.io:443',
    faucetUrl: 'https://faucet.devnet.sui.io/gas',
    explorerUrl: 'https://suiexplorer.com/?network=devnet',
    color: '#3B82F6', // blue-500
    icon: '🧪',
    description: 'Development testing network'
  },
  testnet: {
    name: 'testnet',
    displayName: 'Testnet',
    rpcUrl: 'https://fullnode.testnet.sui.io:443',
    faucetUrl: 'https://faucet.testnet.sui.io/gas',
    explorerUrl: 'https://suiexplorer.com/?network=testnet',
    color: '#F59E0B', // amber-500
    icon: '🧮',
    description: 'Public testing network'
  },
  mainnet: {
    name: 'mainnet',
    displayName: 'Mainnet',
    rpcUrl: 'https://fullnode.mainnet.sui.io:443',
    explorerUrl: 'https://suiexplorer.com/?network=mainnet',
    color: '#EF4444', // red-500
    icon: '🚀',
    description: 'Production network'
  }
};

// Default network based on environment
export const getDefaultNetwork = (): SuiNetworkName => {
  const envNetwork = import.meta.env.VITE_SUI_NETWORK || import.meta.env.VITE_NETWORK;
  
  if (envNetwork && envNetwork in SUI_NETWORKS) {
    return envNetwork as SuiNetworkName;
  }
  
  // Default to devnet for development
  return 'devnet';
};

// Get network configuration
export const getNetworkConfig = (network: SuiNetworkName): SuiNetworkConfig => {
  return SUI_NETWORKS[network];
};

// Get all available networks for UI
export const getAllNetworks = (): SuiNetworkConfig[] => {
  return Object.values(SUI_NETWORKS);
};

// Check if network has faucet
export const networkHasFaucet = (network: SuiNetworkName): boolean => {
  return !!SUI_NETWORKS[network].faucetUrl;
};

// Get explorer URL for transaction
export const getTransactionUrl = (network: SuiNetworkName, txHash: string): string => {
  const config = getNetworkConfig(network);
  return `${config.explorerUrl}/txblock/${txHash}`;
};

// Get explorer URL for address
export const getAddressUrl = (network: SuiNetworkName, address: string): string => {
  const config = getNetworkConfig(network);
  return `${config.explorerUrl}/address/${address}`;
};

// Storage keys for network preference
export const NETWORK_STORAGE_KEY = 'memeflow-sui-network';

// Save network preference to localStorage
export const saveNetworkPreference = (network: SuiNetworkName): void => {
  try {
    localStorage.setItem(NETWORK_STORAGE_KEY, network);
  } catch (error) {
    console.warn('Failed to save network preference:', error);
  }
};

// Load network preference from localStorage
export const loadNetworkPreference = (): SuiNetworkName | null => {
  try {
    const saved = localStorage.getItem(NETWORK_STORAGE_KEY);
    if (saved && saved in SUI_NETWORKS) {
      return saved as SuiNetworkName;
    }
  } catch (error) {
    console.warn('Failed to load network preference:', error);
  }
  return null;
};

// Get network with user preference fallback
export const getUserPreferredNetwork = (): SuiNetworkName => {
  const saved = loadNetworkPreference();
  return saved || getDefaultNetwork();
};