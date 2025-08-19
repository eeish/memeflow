import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { 
  SuiNetworkName, 
  SuiNetworkConfig
} from '../lib/networks';
import {
  getNetworkConfig,
  getUserPreferredNetwork,
  saveNetworkPreference 
} from '../lib/networks';

interface NetworkContextType {
  currentNetwork: SuiNetworkName;
  networkConfig: SuiNetworkConfig;
  switchNetwork: (network: SuiNetworkName) => void;
  isNetworkSupported: (network: SuiNetworkName) => boolean;
  getExplorerUrl: (txHash?: string, address?: string) => string;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

interface NetworkProviderProps {
  children: ReactNode;
  initialNetwork?: SuiNetworkName;
}

export const NetworkProvider: React.FC<NetworkProviderProps> = ({ 
  children, 
  initialNetwork 
}) => {
  const [currentNetwork, setCurrentNetwork] = useState<SuiNetworkName>(
    initialNetwork || getUserPreferredNetwork()
  );
  
  const [networkConfig, setNetworkConfig] = useState<SuiNetworkConfig>(
    getNetworkConfig(currentNetwork)
  );

  // Update network config when current network changes
  useEffect(() => {
    const config = getNetworkConfig(currentNetwork);
    setNetworkConfig(config);
    
    // Save preference to localStorage
    saveNetworkPreference(currentNetwork);
    
    console.log(`🌐 Network switched to: ${config.displayName} (${config.rpcUrl})`);
  }, [currentNetwork]);

  const switchNetwork = (network: SuiNetworkName) => {
    if (network === currentNetwork) return;
    
    console.log(`🔄 Switching network from ${currentNetwork} to ${network}`);
    setCurrentNetwork(network);
  };

  const isNetworkSupported = (network: SuiNetworkName): boolean => {
    // All networks are supported, but you could add logic here
    // to disable certain networks based on deployment configuration
    return true;
  };

  const getExplorerUrl = (txHash?: string, address?: string): string => {
    const baseUrl = networkConfig.explorerUrl;
    
    if (txHash) {
      return `${baseUrl}/txblock/${txHash}`;
    }
    
    if (address) {
      return `${baseUrl}/address/${address}`;
    }
    
    return baseUrl;
  };

  const contextValue: NetworkContextType = {
    currentNetwork,
    networkConfig,
    switchNetwork,
    isNetworkSupported,
    getExplorerUrl
  };

  return (
    <NetworkContext.Provider value={contextValue}>
      {children}
    </NetworkContext.Provider>
  );
};

// Hook to use network context
export const useNetwork = (): NetworkContextType => {
  const context = useContext(NetworkContext);
  
  if (context === undefined) {
    throw new Error('useNetwork must be used within a NetworkProvider');
  }
  
  return context;
};

// Hook to get current network info
export const useNetworkConfig = () => {
  const { networkConfig } = useNetwork();
  return networkConfig;
};

// Hook to switch networks
export const useNetworkSwitcher = () => {
  const { currentNetwork, switchNetwork, isNetworkSupported } = useNetwork();
  
  return {
    currentNetwork,
    switchNetwork,
    isNetworkSupported
  };
};