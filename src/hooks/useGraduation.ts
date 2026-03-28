import { useState, useEffect, useCallback } from 'react';
import { useCurrentAccount, useSignPersonalMessage, useSuiClient } from '@mysten/dapp-kit';
import { useShareMarket, calculatePriceMist } from './useShareMarket';
import { useContractAddresses } from './useContractsSocial';
import { apiService, type GraduationLaunchStatus } from '../lib/api';
import {
  type GraduationState,
  type GraduationConfig,
  GRADUATION_THRESHOLD,
  getMarketPhase,
  resolveGraduationVaultMetadata,
} from '../lib/graduation';
import { useNetwork } from '../contexts/NetworkContext';

function normalizeOwnerAddressForAuth(value: string): string {
  const stripped = value.trim().toLowerCase().replace(/^0x/, '');
  return `0x${stripped.padStart(64, '0')}`;
}

function generateAuthNonce(): string {
  const random = new Uint8Array(16);
  crypto.getRandomValues(random);
  return Array.from(random)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function buildGraduationLaunchAuthMessage(
  ownerAddress: string,
  marketId: string,
  tokenName: string,
  tokenSymbol: string,
  network: string,
  authTimestampMs: number,
  authNonce: string,
): string {
  return `Cord Graduation Launch Authorization\n\nOwner: ${ownerAddress}\nMarket ID: ${marketId}\nToken Name: ${tokenName}\nToken Symbol: ${tokenSymbol}\nNetwork: ${network}\nTimestamp: ${authTimestampMs}\nNonce: ${authNonce}\n\nSign this message to authorize Cord to publish the creator token, graduate the market, initialize the Phase 2 AMM pool, and seed the launch liquidity using the Cord operator wallet.`;
}

function calculateTreasury(holders: number): bigint {
  let total = 0n;
  for (let i = 1; i <= holders; i += 1) {
    total += calculatePriceMist(i);
  }
  return total;
}

export function useGraduation(ownerAddress?: string | null) {
  const { findMarketByOwner } = useShareMarket();
  const { graduationRegistryId } = useContractAddresses();
  const { currentNetwork } = useNetwork();
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { mutate: signPersonalMessage } = useSignPersonalMessage();

  const [isLoading, setIsLoading] = useState(true);
  const [holdersCount, setHoldersCount] = useState(0);
  const [marketFound, setMarketFound] = useState(false);
  const [marketGraduated, setMarketGraduated] = useState(false);
  const [launchStatus, setLaunchStatus] = useState<GraduationLaunchStatus | null>(null);
  const [vaultMetadata, setVaultMetadata] = useState<{
    tokenSymbol?: string;
    tokenName?: string;
    tokenType?: string;
    vaultId?: string;
    poolId?: string;
    liquidityPrepared?: boolean;
    initialLiquiditySeeded?: boolean;
  } | null>(null);

  const signAuthMessage = useCallback(
    async (message: string): Promise<string> =>
      new Promise((resolve, reject) => {
        signPersonalMessage(
          { message: new TextEncoder().encode(message) },
          {
            onSuccess: (result) => resolve(result.signature),
            onError: (error) => reject(error),
          },
        );
      }),
    [signPersonalMessage],
  );

  const refreshLaunchStatus = useCallback(async () => {
    if (!ownerAddress) {
      setLaunchStatus(null);
      return null;
    }

    const response = await apiService.getGraduationLaunchStatus(ownerAddress);
    if (response?.success && response.data) {
      setLaunchStatus(response.data);
      return response.data;
    }

    setLaunchStatus(null);
    return null;
  }, [ownerAddress]);

  const refreshVaultMetadata = useCallback(async () => {
    if (!ownerAddress || !graduationRegistryId || graduationRegistryId === '0x0') {
      setVaultMetadata(null);
      return null;
    }
    const market = await findMarketByOwner(ownerAddress);
    if (!market) {
      setVaultMetadata(null);
      return null;
    }
    const resolved = await resolveGraduationVaultMetadata(client, graduationRegistryId, market.objectId);
    setVaultMetadata(resolved);
    return resolved;
  }, [client, findMarketByOwner, graduationRegistryId, ownerAddress]);

  useEffect(() => {
    if (!ownerAddress) {
      setIsLoading(false);
      setHoldersCount(0);
      setMarketFound(false);
      setMarketGraduated(false);
      setLaunchStatus(null);
      setVaultMetadata(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    findMarketByOwner(ownerAddress)
      .then((market) => {
        if (cancelled) return;
        if (market) {
          setHoldersCount(market.holders);
          setMarketFound(true);
          setMarketGraduated(Boolean(market.graduated));
        } else {
          setHoldersCount(0);
          setMarketFound(false);
          setMarketGraduated(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMarketFound(false);
          setMarketGraduated(false);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    refreshLaunchStatus().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [findMarketByOwner, ownerAddress, refreshLaunchStatus]);

  useEffect(() => {
    if (!ownerAddress || (!marketGraduated && launchStatus?.status !== 'completed')) return;
    refreshVaultMetadata().catch(() => undefined);
  }, [launchStatus?.status, marketGraduated, ownerAddress, refreshVaultMetadata]);

  useEffect(() => {
    if (!ownerAddress) return;
    if (launchStatus?.status !== 'queued' && launchStatus?.status !== 'running') return;

    const interval = window.setInterval(() => {
      refreshLaunchStatus().catch(() => undefined);
      if (marketGraduated || launchStatus.status === 'completed') {
        refreshVaultMetadata().catch(() => undefined);
      }
    }, 5000);

    return () => {
      window.clearInterval(interval);
    };
  }, [launchStatus, marketGraduated, ownerAddress, refreshLaunchStatus, refreshVaultMetadata]);

  const graduationState: GraduationState | null = (() => {
    if (!ownerAddress || !marketFound) return null;

    const holders = Math.max(1, holdersCount);
    const treasury = calculateTreasury(holders);
    const pendingLaunch = launchStatus?.status === 'queued' || launchStatus?.status === 'running';

    if (marketGraduated || launchStatus?.status === 'completed') {
      return {
        phase: 'graduated',
        holdersCount: holders,
        graduationThreshold: GRADUATION_THRESHOLD,
        treasuryBalanceMist: treasury,
        tokenName: vaultMetadata?.tokenName || launchStatus?.token_name,
        tokenSymbol: vaultMetadata?.tokenSymbol || launchStatus?.token_symbol || undefined,
        tokenPackageId: launchStatus?.package_id || vaultMetadata?.tokenType?.split('::')[0],
        tokenType: vaultMetadata?.tokenType || launchStatus?.token_type,
        tokenVaultId: vaultMetadata?.vaultId || launchStatus?.vault_id,
        liquidityPooled: treasury,
        poolId: vaultMetadata?.poolId || launchStatus?.pool_id,
        liquidityPrepared: vaultMetadata?.liquidityPrepared,
        initialLiquiditySeeded:
          vaultMetadata?.initialLiquiditySeeded || !!(vaultMetadata?.poolId || launchStatus?.pool_id),
        launchStatus: launchStatus?.status,
        launchStep: launchStatus?.step,
        launchError: launchStatus?.error,
        operatorAddress: launchStatus?.operator_address,
      };
    }

    return {
      phase: pendingLaunch ? 'graduating' : getMarketPhase(holders),
      holdersCount: holders,
      graduationThreshold: GRADUATION_THRESHOLD,
      treasuryBalanceMist: treasury,
      tokenName: launchStatus?.token_name,
      tokenSymbol: launchStatus?.token_symbol,
      tokenPackageId: launchStatus?.package_id,
      tokenType: launchStatus?.token_type,
      tokenVaultId: launchStatus?.vault_id,
      poolId: launchStatus?.pool_id,
      liquidityPrepared: vaultMetadata?.liquidityPrepared,
      initialLiquiditySeeded: vaultMetadata?.initialLiquiditySeeded,
      launchStatus: launchStatus?.status,
      launchStep: launchStatus?.step,
      launchError: launchStatus?.error,
      operatorAddress: launchStatus?.operator_address,
    };
  })();

  const triggerGraduation = useCallback(
    async (config: GraduationConfig) => {
      if (!ownerAddress) throw new Error('No owner address');
      if (!account?.address) throw new Error('Wallet not connected');
      if (account.address.toLowerCase() !== ownerAddress.toLowerCase()) {
        throw new Error('Only the market owner can authorize token launch');
      }

      const market = await findMarketByOwner(ownerAddress);
      if (!market) {
        throw new Error('Market not found for this user');
      }
      if (!market.graduated && market.holders < GRADUATION_THRESHOLD) {
        throw new Error(`Need at least ${GRADUATION_THRESHOLD} holders before launch`);
      }

      const normalizedOwnerAddress = normalizeOwnerAddressForAuth(ownerAddress);
      const normalizedTokenName = config.tokenName.trim();
      const normalizedTokenSymbol = config.tokenSymbol.trim().toUpperCase();
      const authTimestampMs = Date.now();
      const authNonce = generateAuthNonce();
      const authMessage = buildGraduationLaunchAuthMessage(
        normalizedOwnerAddress,
        market.objectId,
        normalizedTokenName,
        normalizedTokenSymbol,
        currentNetwork,
        authTimestampMs,
        authNonce,
      );
      const authSignature = await signAuthMessage(authMessage);

      const response = await apiService.requestGraduationLaunch({
        owner_address: normalizedOwnerAddress,
        market_id: market.objectId,
        token_name: normalizedTokenName,
        token_symbol: normalizedTokenSymbol,
        auth_nonce: authNonce,
        auth_timestamp_ms: authTimestampMs,
        auth_signature: authSignature,
      });

      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to queue graduation launch');
      }

      setLaunchStatus(response.data);
      setMarketFound(true);
      setHoldersCount(market.holders);
    },
    [account?.address, currentNetwork, findMarketByOwner, ownerAddress, signAuthMessage],
  );

  return {
    graduationState,
    isLoading,
    triggerGraduation,
    refreshLaunchStatus,
  };
}
