import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import {
  DeepBookClient,
  mainnetCoins,
  mainnetPools,
  testnetCoins,
  testnetPools,
  type CoinMap,
  type DeepBookCompatibleClient,
  type PoolMap,
} from '@mysten/deepbook-v3';
import { Transaction } from '@mysten/sui/transactions';
import { useNetwork } from '../contexts/NetworkContext';

const CUSTOM_POOL_KEY = 'CREATOR_SUI';
const CUSTOM_TOKEN_KEY = 'CREATOR_TOKEN';
const ZERO_ADDRESS = '0x0';
const TOKEN_SCALAR = 1_000_000_000;

export interface DeepBookQuote {
  baseOut: number | null;
  suiOut: number | null;
  midPriceSui: number | null;
  deepRequired: number;
  minOut: number | null;
  priceImpactPct: number | null;
}

export interface DeepBookMarketState {
  midPriceSui: number | null;
  tickSize: number | null;
  lotSize: number | null;
  minSize: number | null;
  whitelisted: boolean | null;
  deepBalance: number | null;
}

type SupportedDeepBookNetwork = 'mainnet' | 'testnet';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isSupportedDeepBookNetwork(network: string): network is SupportedDeepBookNetwork {
  return network === 'mainnet' || network === 'testnet';
}

function getBaseCoins(network: SupportedDeepBookNetwork): CoinMap {
  return network === 'mainnet' ? mainnetCoins : testnetCoins;
}

function getBasePools(network: SupportedDeepBookNetwork): PoolMap {
  return network === 'mainnet' ? mainnetPools : testnetPools;
}

function getTokenAddress(tokenType: string): string {
  return tokenType.split('::')[0] || tokenType;
}

function calculatePriceImpactPct(side: 'buy' | 'sell', amount: number, midPriceSui: number | null, output: number): number | null {
  if (!midPriceSui || amount <= 0 || output <= 0) return null;

  const idealOutput = side === 'buy'
    ? amount / midPriceSui
    : amount * midPriceSui;
  if (idealOutput <= 0) return null;

  const impact = (1 - (output / idealOutput)) * 100;
  return Number(Math.max(0, impact).toFixed(2));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useDeepBook(poolId?: string, tokenType?: string) {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const { currentNetwork } = useNetwork();
  const { mutateAsync: signAndExecuteAsync } = useSignAndExecuteTransaction();

  const supportedNetwork = isSupportedDeepBookNetwork(currentNetwork) ? currentNetwork : null;
  const poolAvailable = Boolean(poolId && tokenType && supportedNetwork);

  const deepBookClient = useMemo(() => {
    if (!poolId || !tokenType || !supportedNetwork) return null;

    const baseCoins = getBaseCoins(supportedNetwork);
    const basePools = getBasePools(supportedNetwork);

    return new DeepBookClient({
      client: client as DeepBookCompatibleClient,
      address: account?.address || ZERO_ADDRESS,
      network: supportedNetwork,
      coins: {
        ...baseCoins,
        [CUSTOM_TOKEN_KEY]: {
          address: getTokenAddress(tokenType),
          type: tokenType,
          scalar: TOKEN_SCALAR,
        },
      },
      pools: {
        ...basePools,
        [CUSTOM_POOL_KEY]: {
          address: poolId,
          baseCoin: CUSTOM_TOKEN_KEY,
          quoteCoin: 'SUI',
        },
      },
    });
  }, [account?.address, client, poolId, supportedNetwork, tokenType]);

  const [marketState, setMarketState] = useState<DeepBookMarketState>({
    midPriceSui: null,
    tickSize: null,
    lotSize: null,
    minSize: null,
    whitelisted: null,
    deepBalance: null,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolveTxStatus = useCallback(
    async (digest: string): Promise<{ status?: string; error?: string }> => {
      for (let attempt = 0; attempt < 6; attempt++) {
        try {
          const txBlock = await client.getTransactionBlock({
            digest,
            options: { showEffects: true },
          });
          return {
            status: txBlock.effects?.status?.status,
            error: txBlock.effects?.status?.error,
          };
        } catch (fetchErr: unknown) {
          if (attempt < 5) {
            await delay(500);
            continue;
          }
          return { error: getErrorMessage(fetchErr) };
        }
      }

      return {};
    },
    [client],
  );

  useEffect(() => {
    if (!deepBookClient || !poolAvailable) {
      setMarketState({
        midPriceSui: null,
        tickSize: null,
        lotSize: null,
        minSize: null,
        whitelisted: null,
        deepBalance: null,
      });
      setError(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    Promise.all([
      deepBookClient.midPrice(CUSTOM_POOL_KEY),
      deepBookClient.poolBookParams(CUSTOM_POOL_KEY),
      deepBookClient.whitelisted(CUSTOM_POOL_KEY),
      account?.address
        ? client.getBalance({
            owner: account.address,
            coinType: getBaseCoins(supportedNetwork!).DEEP.type,
          })
        : Promise.resolve(null),
    ])
      .then(([midPriceSui, bookParams, whitelisted, deepBalance]) => {
        if (cancelled) return;
        setMarketState({
          midPriceSui,
          tickSize: bookParams.tickSize,
          lotSize: bookParams.lotSize,
          minSize: bookParams.minSize,
          whitelisted,
          deepBalance: deepBalance ? Number(deepBalance.totalBalance) / 1_000_000 : null,
        });
      })
      .catch((fetchErr: unknown) => {
        if (cancelled) return;
        setError(getErrorMessage(fetchErr) || 'Failed to load DeepBook pool');
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [account?.address, client, deepBookClient, poolAvailable, supportedNetwork]);

  const getQuote = useCallback(
    async (side: 'buy' | 'sell', amount: number, slippageBps = 100): Promise<DeepBookQuote> => {
      if (!deepBookClient || !poolAvailable) {
        return {
          baseOut: null,
          suiOut: null,
          midPriceSui: null,
          deepRequired: 0,
          minOut: null,
          priceImpactPct: null,
        };
      }

      const midPriceSui = marketState.midPriceSui ?? await deepBookClient.midPrice(CUSTOM_POOL_KEY);

      if (side === 'buy') {
        const result = await deepBookClient.getBaseQuantityOut(CUSTOM_POOL_KEY, amount);
        return {
          baseOut: result.baseOut,
          suiOut: null,
          midPriceSui,
          deepRequired: result.deepRequired,
          minOut: Number((result.baseOut * (1 - slippageBps / 10_000)).toFixed(9)),
          priceImpactPct: calculatePriceImpactPct(side, amount, midPriceSui, result.baseOut),
        };
      }

      const result = await deepBookClient.getQuoteQuantityOut(CUSTOM_POOL_KEY, amount);
      return {
        baseOut: null,
        suiOut: result.quoteOut,
        midPriceSui,
        deepRequired: result.deepRequired,
        minOut: Number((result.quoteOut * (1 - slippageBps / 10_000)).toFixed(9)),
        priceImpactPct: calculatePriceImpactPct(side, amount, midPriceSui, result.quoteOut),
      };
    },
    [deepBookClient, marketState.midPriceSui, poolAvailable],
  );

  const placeOrder = useCallback(
    async (
      side: 'buy' | 'sell',
      amount: number,
      quote?: DeepBookQuote,
    ): Promise<{ success: boolean; digest?: string; error?: string }> => {
      if (!deepBookClient || !poolAvailable) {
        return { success: false, error: 'DeepBook pool is not available.' };
      }

      try {
        const resolvedQuote = quote ?? await getQuote(side, amount);
        if ((side === 'buy' && !resolvedQuote.baseOut) || (side === 'sell' && !resolvedQuote.suiOut)) {
          return { success: false, error: 'Quote unavailable for this trade.' };
        }

        const tx = new Transaction();
        tx.add(
          deepBookClient.deepBook.swapExactQuantity({
            poolKey: CUSTOM_POOL_KEY,
            amount,
            deepAmount: resolvedQuote.deepRequired,
            minOut: resolvedQuote.minOut ?? 0,
            isBaseToCoin: side === 'sell',
          }),
        );

        const result = await signAndExecuteAsync({ transaction: tx });
        const digest = typeof result === 'object' && result !== null && 'digest' in result && typeof result.digest === 'string'
          ? result.digest
          : undefined;
        if (!digest) {
          return { success: false, error: 'Transaction response missing digest.' };
        }

        const txStatus = await resolveTxStatus(digest);
        if (txStatus.status && txStatus.status !== 'success') {
          return { success: false, error: txStatus.error || 'Transaction failed.' };
        }

        return { success: true, digest };
      } catch (submitErr: unknown) {
        return { success: false, error: getErrorMessage(submitErr) || 'Trade submission failed.' };
      }
    },
    [deepBookClient, getQuote, poolAvailable, resolveTxStatus, signAndExecuteAsync],
  );

  return {
    poolAvailable,
    isLoading,
    error,
    marketState,
    getQuote,
    placeOrder,
  };
}
