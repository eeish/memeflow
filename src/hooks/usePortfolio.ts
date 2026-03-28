import { useState, useEffect, useCallback } from 'react';
import { useCurrentAccount, useSuiClient } from '@mysten/dapp-kit';
import { useContractAddresses } from './useContractsSocial';
import { calculatePriceMist } from './useShareMarket';
import { apiService } from '../lib/api';
import { resolveGraduationVaultMetadata } from '../lib/graduation';
import type { UserSummary } from '../types/users';

interface ParsedSharePurchaseEvent {
  buyer?: string;
  market_id?: string;
  price_mist?: string;
  creator?: string;
}

interface ParsedShareSoldEvent {
  seller?: string;
  market_id?: string;
}

interface MarketObjectContent {
  fields?: {
    holders?: string | number;
    graduated?: boolean;
  };
}

interface StoredGraduationData {
  tokenSymbol?: string;
  tokenType?: string;
  poolId?: string;
}

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

// Fetch all pages of events for a given query, filtered to transactions sent
// by `sender`. Returns every event across all pages (no hard limit).
async function fetchAllUserEvents(
  client: ReturnType<typeof useSuiClient>,
  moveEventType: string,
  sender: string,
): Promise<Array<{ parsedJson: unknown; timestampMs?: string | null }>> {
  const results: Array<{ parsedJson: unknown; timestampMs?: string | null }> = [];
  let cursor: { eventSeq: string; txDigest: string } | null = null;

  while (true) {
    const page = await client.queryEvents({
      query: {
        And: [
          { MoveEventType: moveEventType },
          { Sender: sender },
        ],
      },
      order: 'ascending',
      limit: 50,
      cursor: cursor ?? undefined,
    });

    results.push(...page.data);

    if (!page.hasNextPage || !page.nextCursor) break;
    cursor = page.nextCursor;
  }

  return results;
}

export function usePortfolio(): PortfolioData {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { packageId, originalPackageId, graduationRegistryId } = useContractAddresses();

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

      // Collect unique package IDs to query — originalPackageId covers the
      // first deployment; packageId covers any upgraded deployment. Querying
      // both ensures holdings from before a fresh deploy are still visible.
      const packageIds = Array.from(new Set([originalPackageId, packageId].filter(Boolean)));

      // 1 & 2. Fetch purchase and sell events for every relevant package ID.
      //        Uses Sender filter + cursor pagination so we get every event
      //        for this user without a hard 50-event cap.
      type MergedEvent =
        | { type: 'purchase'; marketId: string; priceMist: bigint; creatorAddress: string; ts: number }
        | { type: 'sell';     marketId: string; ts: number };

      const merged: MergedEvent[] = [];

      for (const pkgId of packageIds) {
        const [purchaseEvents, soldEvents] = await Promise.all([
          fetchAllUserEvents(client, `${pkgId}::share_market::SharePurchased`, userAddress),
          fetchAllUserEvents(client, `${pkgId}::share_market::ShareSold`, userAddress),
        ]);

        for (const event of purchaseEvents) {
          const parsed = event.parsedJson as ParsedSharePurchaseEvent | null;
          if (parsed?.buyer === userAddress && parsed.market_id && parsed.price_mist && parsed.creator) {
            merged.push({
              type: 'purchase',
              marketId: parsed.market_id,
              priceMist: BigInt(parsed.price_mist),
              creatorAddress: parsed.creator,
              ts: Number(event.timestampMs ?? 0),
            });
          }
        }

        for (const event of soldEvents) {
          const parsed = event.parsedJson as ParsedShareSoldEvent | null;
          if (parsed?.seller === userAddress && parsed.market_id) {
            merged.push({
              type: 'sell',
              marketId: parsed.market_id,
              ts: Number(event.timestampMs ?? 0),
            });
          }
        }
      }

      // Sort ascending by timestamp — reconstructs true on-chain history
      merged.sort((a, b) => a.ts - b.ts);

      // Replay events in order to compute current hold state
      for (const ev of merged) {
        if (ev.type === 'purchase') {
          // Rebuy overwrites previous entry — held: true with the new price
          marketMap.set(ev.marketId, {
            held: true,
            purchasePriceMist: ev.priceMist,
            creatorAddress: ev.creatorAddress,
          });
        } else {
          const existing = marketMap.get(ev.marketId);
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

          const content = marketObj.data?.content as MarketObjectContent | undefined;
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
                const stored = JSON.parse(raw) as StoredGraduationData;
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
                tokenQuantity = coins.data.reduce((sum, coin) => sum + BigInt(coin.balance), 0n);
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
  }, [account?.address, client, packageId, originalPackageId, graduationRegistryId]);

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
