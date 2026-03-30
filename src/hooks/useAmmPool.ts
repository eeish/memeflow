import { useCallback, useEffect, useState } from 'react';
import { useSuiClient } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { useContractAddresses } from './useContractsSocial';
import { useActiveAddress } from './useActiveAddress';
import { useTransactionExecutor } from './useTransactionExecutor';

const BPS_DENOMINATOR = 10_000n;
const MIST_PER_SUI = 1_000_000_000n;
const TOKEN_SCALAR = 1_000_000_000n;

export interface AmmMarketState {
  poolId: string;
  feeBps: number;
  suiReserveMist: bigint;
  tokenReserve: bigint;
  totalSwaps: number;
  cumulativeVolumeSuiMist: bigint;
  spotPriceSui: number;
}

interface SwapResult {
  success: boolean;
  error?: string;
  txDigest?: string;
}

function parseBigIntField(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.trunc(value));
  if (typeof value === 'string' && value.length > 0) return BigInt(value);
  return 0n;
}

function quoteAmountOut(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
  feeBps: number,
): bigint {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return 0n;
  const fee = BigInt(feeBps);
  const amountInWithFee = amountIn * (BPS_DENOMINATOR - fee);
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn * BPS_DENOMINATOR + amountInWithFee;
  if (denominator <= 0n) return 0n;
  return numerator / denominator;
}

export function useAmmPool(poolId?: string, tokenType?: string) {
  const activeAddress = useActiveAddress();
  const client = useSuiClient();
  const { executeTransaction } = useTransactionExecutor();
  const { packageId } = useContractAddresses();

  const [marketState, setMarketState] = useState<AmmMarketState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!poolId) {
      setMarketState(null);
      setError(null);
      return null;
    }

    setIsLoading(true);
    try {
      const poolObject = await client.getObject({
        id: poolId,
        options: { showContent: true },
      });
      const fields = (poolObject.data?.content as { fields?: Record<string, unknown> } | undefined)?.fields;
      if (!fields) {
        throw new Error('AMM pool object content is unavailable');
      }

      const feeBps = Number(fields.fee_bps ?? 0);
      const suiReserveMist = parseBigIntField(fields.sui_reserve_mist);
      const tokenReserve = parseBigIntField(fields.token_reserve);
      const totalSwaps = Number(fields.total_swaps ?? 0);
      const cumulativeVolumeSuiMist = parseBigIntField(fields.cumulative_volume_sui_mist);
      const spotPriceSui =
        tokenReserve > 0n ? Number(suiReserveMist) / Number(tokenReserve) : 0;

      const nextState = {
        poolId,
        feeBps,
        suiReserveMist,
        tokenReserve,
        totalSwaps,
        cumulativeVolumeSuiMist,
        spotPriceSui,
      };

      setMarketState(nextState);
      setError(null);
      return nextState;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load AMM pool';
      setError(message);
      setMarketState(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [client, poolId]);

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  const resolveTxStatus = useCallback(async (result: unknown): Promise<{ digest?: string; status?: string; error?: string }> => {
    const txResult = result as { digest?: string; effects?: { status?: { status?: string; error?: string } } };
    const digest = txResult?.digest;
    let status = txResult?.effects?.status?.status;
    let statusError = txResult?.effects?.status?.error;

    if (!status && digest) {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
          const txBlock = await client.getTransactionBlock({
            digest,
            options: { showEffects: true },
          });
          status = txBlock.effects?.status?.status;
          statusError = txBlock.effects?.status?.error || statusError;
          if (status) break;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    }

    return { digest, status, error: statusError };
  }, [client]);

  const getQuote = useCallback(
    (side: 'buy' | 'sell', amountInRaw: bigint): bigint => {
      if (!marketState) return 0n;
      return side === 'buy'
        ? quoteAmountOut(amountInRaw, marketState.suiReserveMist, marketState.tokenReserve, marketState.feeBps)
        : quoteAmountOut(amountInRaw, marketState.tokenReserve, marketState.suiReserveMist, marketState.feeBps);
    },
    [marketState],
  );

  const executeSwap = useCallback(async (
    side: 'buy' | 'sell',
    amountInRaw: bigint,
    minAmountOutRaw: bigint,
  ): Promise<SwapResult> => {
    if (!activeAddress) {
      return { success: false, error: 'Please sign in to continue' };
    }
    if (!packageId || packageId === '0x0') {
      return { success: false, error: 'Contracts not deployed' };
    }
    if (!poolId || !tokenType) {
      return { success: false, error: 'AMM pool is not available for this token' };
    }
    if (amountInRaw <= 0n) {
      return { success: false, error: 'Enter an amount greater than zero' };
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const tx = new Transaction();

      if (side === 'buy') {
        const [paymentCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountInRaw.toString())]);
        tx.moveCall({
          target: `${packageId}::phase2_amm::buy_exact_sui_for_tokens`,
          typeArguments: [tokenType],
          arguments: [
            tx.object(poolId),
            paymentCoin,
            tx.pure.u64(minAmountOutRaw.toString()),
          ],
        });
      } else {
        const ownedCoins = await client.getCoins({
          owner: activeAddress,
          coinType: tokenType,
        });
        if (!ownedCoins.data.length) {
          return { success: false, error: 'No token balance available to sell' };
        }

        const primaryCoin = tx.object(ownedCoins.data[0].coinObjectId);
        const mergeCoins = ownedCoins.data.slice(1).map((coin) => tx.object(coin.coinObjectId));
        if (mergeCoins.length > 0) {
          tx.mergeCoins(primaryCoin, mergeCoins);
        }
        const [sellCoin] = tx.splitCoins(primaryCoin, [tx.pure.u64(amountInRaw.toString())]);
        tx.moveCall({
          target: `${packageId}::phase2_amm::sell_exact_tokens_for_sui`,
          typeArguments: [tokenType],
          arguments: [
            tx.object(poolId),
            sellCoin,
            tx.pure.u64(minAmountOutRaw.toString()),
          ],
        });
      }

      const result = await executeTransaction({ transaction: tx });

      const txStatus = await resolveTxStatus(result);
      if (txStatus.status && txStatus.status !== 'success') {
        return { success: false, error: txStatus.error || 'Swap transaction failed' };
      }
      if (!txStatus.digest && !txStatus.status) {
        return { success: false, error: 'Transaction response missing digest/status' };
      }

      await refresh();
      return { success: true, txDigest: txStatus.digest };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Swap failed';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsSubmitting(false);
    }
  }, [activeAddress, client, packageId, poolId, refresh, resolveTxStatus, executeTransaction, tokenType]);

  return {
    poolAvailable: !!marketState,
    marketState,
    isLoading,
    isSubmitting,
    error,
    refresh,
    getQuote,
    buyExactSuiForTokens: (amountInMist: bigint, minTokenOutRaw: bigint) =>
      executeSwap('buy', amountInMist, minTokenOutRaw),
    sellExactTokensForSui: (amountInRaw: bigint, minSuiOutMist: bigint) =>
      executeSwap('sell', amountInRaw, minSuiOutMist),
  };
}

export function formatMistAmount(mist: bigint): number {
  return Number(mist) / Number(MIST_PER_SUI);
}

export function formatTokenAmount(raw: bigint): number {
  return Number(raw) / Number(TOKEN_SCALAR);
}
