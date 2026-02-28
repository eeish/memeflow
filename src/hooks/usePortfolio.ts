import { useState, useEffect, useCallback } from 'react';
import { useCurrentAccount, useSuiClient } from '@mysten/dapp-kit';
import { useContractAddresses } from './useContractsSocial';
import { calculatePriceMist } from './useShareMarket';
import { apiService } from '../lib/api';
import type { UserSummary } from '../types/users';

export interface Holding {
  marketId: string;
  creator: UserSummary;
  creatorAddress: string;
  holders: number;
  purchasePriceMist: bigint;
  currentValueMist: bigint;
  pnlPercent: number;
  isGraduated: boolean;
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
  const { originalPackageId } = useContractAddresses();

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

      // Build a map of marketId -> { held: boolean, purchasePrice }
      const marketMap = new Map<string, { held: boolean; purchasePriceMist: bigint; creatorAddress: string }>();

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

          // Current sell value = price at current holders position
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

          // Check graduation state from localStorage (written by useGraduation on graduation)
          const graduationData = localStorage.getItem(`cord_graduation_${info.creatorAddress}`);
          const isGraduated = !!graduationData;

          holdingResults.push({
            marketId,
            creator,
            creatorAddress: info.creatorAddress,
            holders,
            purchasePriceMist,
            currentValueMist,
            pnlPercent,
            isGraduated,
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
  }, [account?.address, client, originalPackageId]);

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
