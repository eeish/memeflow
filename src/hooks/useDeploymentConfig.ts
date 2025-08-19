import { useState, useEffect } from 'react';
import { useNetwork } from '../contexts/NetworkContext';
import { loadDeployment } from '../lib/contracts';

export interface DeploymentInfo {
  packageId: string;
  factoryId: string;
  networkName: string;
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook to get deployment configuration for the current network
 */
export function useDeploymentConfig(): DeploymentInfo {
  const { currentNetwork } = useNetwork();
  const [deploymentInfo, setDeploymentInfo] = useState<DeploymentInfo>({
    packageId: '0x0',
    factoryId: '0x0',
    networkName: 'devnet',
    isLoading: true,
    error: null
  });

  useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      try {
        setDeploymentInfo(prev => ({ ...prev, isLoading: true, error: null }));
        
        // Use the current network directly (it's already a string like 'devnet', 'testnet', etc.)
        const deploymentNetwork = currentNetwork;

        const deployment = await loadDeployment(deploymentNetwork);
        
        if (!cancelled) {
          setDeploymentInfo({
            packageId: deployment.packageId,
            factoryId: deployment.factoryId,
            networkName: deploymentNetwork,
            isLoading: false,
            error: null
          });
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load deployment config:', error);
          setDeploymentInfo(prev => ({
            ...prev,
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to load deployment config'
          }));
        }
      }
    }

    loadConfig();

    return () => {
      cancelled = true;
    };
  }, [currentNetwork]);

  return deploymentInfo;
}

/**
 * Hook to get deployment configuration with fallback to environment variables
 */
export function useDeploymentConfigWithFallback(): DeploymentInfo {
  const deploymentInfo = useDeploymentConfig();
  
  // If deployment loading fails, fallback to environment variables
  if (deploymentInfo.error && !deploymentInfo.isLoading) {
    return {
      packageId: import.meta.env.VITE_PACKAGE_ID || deploymentInfo.packageId,
      factoryId: import.meta.env.VITE_FACTORY_ID || deploymentInfo.factoryId,
      networkName: deploymentInfo.networkName,
      isLoading: false,
      error: null
    };
  }
  
  return deploymentInfo;
}