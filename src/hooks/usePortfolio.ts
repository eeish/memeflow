import { useState, useEffect, useCallback } from 'react';
import { useCurrentAccount, useSuiClient } from '@mysten/dapp-kit';
import { useContractAddresses } from './useContractsSocial';
import { calculatePriceMist } from './useShareMarket';
import { apiService } from '../lib/api';
import { resolveGraduationVaultMetadata } from '../lib/graduation';
import type { UserSummary } from '../types/users';

export interface Holding {
  marketId: string;
  creator: UserSummary;
  creatorAddress: string;
  holders: number;          // total market holders (for graduation progress)
  purchasePriceMist: bigint;
  currentValueMist: bigint;
  pnlPercent: number;
  isGraduated: boolean;
  tokenSymbol: string | null; // populated for graduated markets
  tokenType: string | null;
  poolId: string | null;
  tokenQuantity: bigint;      // actual token coins in user's wallet (graduated only)
}

export interface PortfolioData {
  holdings: Holding[];
  totalValueMist: bigint;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function usePortfolio(): PortfolioData {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { originalPackageId, graduationRegistryId } = useContractAddresses();

  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPortfolio = useCallback(async () => {
    if (!account?.address || !originalPackageId || originalPackageId === '0x0') {
      setHoldings([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const userAddress = account.address;

      // Build a map of marketId -> { held: boolean, purchasePrice }
      const marketMap = new Map<string, { held: boolean; purchasePriceMist: bigint; creatorAddress: string }>();

      // 1. Query SharePurchased events where buyer === currentUser
      const purchaseEvents = await client.queryEvents({
        query: {
          MoveEventType: `${originalPackageId}::share_market::SharePurchased`,
        },
        order: 'ascending',
        limit: 50,
      });

      // 2. Query ShareSold events where seller === currentUser
      const soldEvents = await client.queryEvents({
        query: {
          MoveEventType: `${originalPackageId}::share_market::ShareSold`,
        },
        order: 'ascending',
        limit: 50,
      });

      for (const event of purchaseEvents.data) {
        const parsed = event.parsedJson as any;
        if (parsed?.buyer === userAddress) {
          marketMap.set(parsed.market_id, {
            held: true,
            purchasePriceMist: BigInt(parsed.price_mist),
            creatorAddress: parsed.creator,
          });
        }
      }

      for (const event of soldEvents.data) {
        const parsed = event.parsedJson as any;
        if (parsed?.seller === userAddress) {
          const existing = marketMap.get(parsed.market_id);
          if (existing) {
            existing.held = false;
          }
        }
      }

      // 3. Filter to only currently held markets
      const heldMarkets = Array.from(marketMap.entries()).filter(([, v]) => v.held);

      if (heldMarkets.length === 0) {
        setHoldings([]);
        setIsLoading(false);
        return;
      }

      // 4. For each held market, fetch the Market object to get current holders
      const holdingResults: Holding[] = [];

      for (const [marketId, info] of heldMarkets) {
        try {
          // Fetch market object for current holders count
          const marketObj = await client.getObject({
            id: marketId,
            options: { showContent: true },
          });

          const content = marketObj.data?.content as any;
          const holders = content?.fields?.holders ? Number(content.fields.holders) : 1;
          // Use on-chain graduated flag — localStorage is unreliable (not set on other devices)
          const isGraduated = !!content?.fields?.graduated;

          // Current sell value = price at current holders position on bonding curve
          const currentValueMist = calculatePriceMist(holders);
          const purchasePriceMist = info.purchasePriceMist;

          // P&L
          const pnlPercent = purchasePriceMist > 0n
            ? Number(((currentValueMist - purchasePriceMist) * 10000n) / purchasePriceMist) / 100
            : 0;

          // Resolve creator profile from wallet address
          let creator: UserSummary = {
            id: '',
            username: info.creatorAddress.slice(0, 6) + '...' + info.creatorAddress.slice(-4),
            avatar_url: null,
            token_symbol: '',
          };

          try {
            const userResp = await apiService.getUserByAddress(info.creatorAddress);
            if (userResp.success && userResp.data) {
              creator = {
                id: userResp.data.id,
                username: userResp.data.username,
                avatar_url: userResp.data.avatar_url || null,
                token_symbol: userResp.data.token_symbol,
              };
            }
          } catch {
            // Keep fallback creator
          }

          // For graduated markets: resolve token symbol and actual on-chain token balance.
          // Source priority:
          //   1. localStorage (set on the launcher's device during graduation)
          //   2. On-chain CreatorTokenVault shared object via graduation registry
          // Never fall back to creator.token_symbol — that field is the profile's pre-graduation
          // placeholder (often set to the username) and is unrelated to the launched token.
          let tokenSymbol: string | null = null;
          let tokenQuantity = 0n;
          let resolvedTokenType: string | null = null;
          let poolId: string | null = null;

          if (isGraduated) {
            // Try localStorage first (fast path — only works on the launcher's own device)
            const raw = localStorage.getItem(`cord_graduation_${info.creatorAddress}`);
            if (raw) {
              try {
                const stored = JSON.parse(raw);
                if (stored.tokenSymbol) tokenSymbol = stored.tokenSymbol;
                if (stored.tokenType) resolvedTokenType = stored.tokenType;
                if (stored.poolId) poolId = stored.poolId;
              } catch {
                // ignore
              }
            }

            const vaultMetadata = await resolveGraduationVaultMetadata(client, graduationRegistryId, marketId);
            if (!tokenSymbol && vaultMetadata?.tokenSymbol) tokenSymbol = vaultMetadata.tokenSymbol;
            if (!resolvedTokenType && vaultMetadata?.tokenType) resolvedTokenType = vaultMetadata.tokenType;
            if (!poolId && vaultMetadata?.poolId) poolId = vaultMetadata.poolId;

            // Query on-chain token balance once we have a resolved token type.
            if (resolvedTokenType) {
              try {
                const coins = await client.getCoins({ owner: userAddress, coinType: resolvedTokenType });
                tokenQuantity = coins.data.reduce((sum: bigint, coin: any) => sum + BigInt(coin.balance), 0n);
              } catch {
                // ignore
              }
            }
          }

          holdingResults.push({
            marketId,
            creator,
            creatorAddress: info.creatorAddress,
            holders,
            purchasePriceMist,
            currentValueMist,
            pnlPercent,
            isGraduated,
            tokenSymbol,
            tokenType: resolvedTokenType,
            poolId,
            tokenQuantity,
          });
        } catch (err) {
          console.warn('Failed to fetch market:', marketId, err);
        }
      }

      setHoldings(holdingResults);
    } catch (err) {
      console.error('Failed to fetch portfolio:', err);
      setError('Failed to load holdings');
    } finally {
      setIsLoading(false);
    }
  }, [account?.address, client, originalPackageId, graduationRegistryId]);

  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

  const totalValueMist = holdings.reduce((sum, h) => sum + h.currentValueMist, 0n);

  return {
    holdings,
    totalValueMist,
    isLoading,
    error,
    refetch: fetchPortfolio,
  };
}
