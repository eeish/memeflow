/**
 * React hooks for Cord social contract interactions
 */

import { useState, useEffect } from 'react';
import { useSuiClient } from '@mysten/dapp-kit';
import { loadDeployment } from '../lib/contracts-social';
import type { CordDeployment } from '../lib/contracts-social';
import { useNetwork } from '../contexts/NetworkContext';

/**
 * Hook for loading deployment configuration
 */
export function useDeploymentConfig() {
  const { currentNetwork } = useNetwork();
  const [deployment, setDeployment] = useState<CordDeployment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadConfig = async () => {
      try {
        setLoading(true);
        setError(null);
        
        console.log(`🔗 Loading deployment config for network: ${currentNetwork}`);
        const config = await loadDeployment(currentNetwork);
        
        if (mounted) {
          if (config) {
            setDeployment(config);
            console.log(`✅ Deployment config loaded:`, config);
          } else {
            setError(`No deployment found for ${currentNetwork}`);
            console.warn(`⚠️ No deployment config found for ${currentNetwork}`);
          }
        }
      } catch (err) {
        if (mounted) {
          const errorMsg = err instanceof Error ? err.message : 'Failed to load deployment';
          setError(errorMsg);
          console.error('Deployment loading error:', err);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadConfig();

    return () => {
      mounted = false;
    };
  }, [currentNetwork]);

  return { deployment, loading, error };
}

/**
 * Hook for getting contract addresses
 */
export function useContractAddresses() {
  const { deployment } = useDeploymentConfig();

  const packageId =
    import.meta.env.VITE_PACKAGE_ID || deployment?.packageId || '';
  const graduationRegistryId =
    import.meta.env.VITE_GRADUATION_REGISTRY_ID || deployment?.graduationRegistryId || '';

  return {
    /** Latest package ID - use for calling contract functions */
    packageId,
    /** Original package ID - use for querying existing objects (markets, profiles) */
    originalPackageId: deployment?.originalPackageId || packageId,
    /** Shared object for calling graduation::graduate */
    graduationRegistryId,
    /** Max holders in Phase 1 */
    maxSupply: deployment?.maxSupply || 2,
    /** Holders threshold required before launch is allowed (same as maxSupply). */
    graduationThreshold: deployment?.maxSupply || 2,
    profileRegistryId: deployment?.profileRegistryId || '',
    factoryId: deployment?.factoryId || '',
  };
}

/**
 * Hook for Sui client with network configuration
 */
export function useConfiguredSuiClient() {
  const client = useSuiClient();
  const { currentNetwork } = useNetwork();
  const { deployment } = useDeploymentConfig();
  
  return {
    client,
    network: currentNetwork,
    rpcUrl: deployment?.rpcUrl || '',
  };
}
