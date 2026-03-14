import { useState, useCallback } from 'react';
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { useContractAddresses } from './useContractsSocial';
import { MAX_SUPPLY, TERM2_DENOM_BASE } from '../lib/graduation';

// Constants from the contract (share_market.move)
const MIST_PER_SUI = 1_000_000_000;
const PRICE_BASE = 20_000_000n;
const PRICE_TERM1_NUM = 350_000_000n;
const PRICE_TERM2_NUM = 1_000_000_000n;
const TERM1_OFFSET = 3n;
const TERM2_DENOM_BASE_BIGINT = BigInt(TERM2_DENOM_BASE);

// Calculate price in MIST for x-th holder/share using bonding curve
export function calculatePriceMist(x: number): bigint {
  if (x < 1) x = 1;
  if (x > MAX_SUPPLY) x = MAX_SUPPLY;
  const xBig = BigInt(x);
  const term1 = PRICE_TERM1_NUM / (xBig + TERM1_OFFSET);
  const term2 = PRICE_TERM2_NUM / (TERM2_DENOM_BASE_BIGINT - xBig);
  return PRICE_BASE + term1 + term2;
}

// Format MIST to SUI for display
export function formatMistToSui(mist: bigint): string {
  const sui = Number(mist) / MIST_PER_SUI;
  if (sui < 0.0001) return '<0.0001';
  if (sui < 1) return sui.toFixed(4);
  if (sui < 100) return sui.toFixed(3);
  return sui.toFixed(2);
}

export interface MarketInfo {
  objectId: string;
  owner: string;
  holders: number;
  graduated: boolean;
  /** The package ID this market was created under — use this for buy/sell calls */
  packageId: string;
}

export function useShareMarket() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  // packageId = latest version for calling contract functions
  // originalPackageId = first deployment for querying existing objects (unchanged across upgrades)
  const { packageId, originalPackageId } = useContractAddresses();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sleep = useCallback((ms: number) => new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  }), []);

  const resolveTxStatus = useCallback(async (result: any): Promise<{ digest?: string; status?: string; error?: string }> => {
    const digest = result?.digest as string | undefined;
    let status = result?.effects?.status?.status as string | undefined;
    let statusError = result?.effects?.status?.error as string | undefined;

    // Some wallet adapters return only digest first. Confirm status from chain.
    if (!status && digest) {
      for (let attempt = 0; attempt < 6; attempt++) {
        try {
          const txBlock = await client.getTransactionBlock({
            digest,
            options: { showEffects: true },
          });
          status = txBlock.effects?.status?.status;
          statusError = txBlock.effects?.status?.error || statusError;
          if (status) break;
        } catch (fetchErr: any) {
          // Transaction might not be indexed yet; retry briefly.
          if (attempt === 5) {
            console.warn('Failed to fetch transaction block after retries:', fetchErr);
          } else {
            await sleep(500);
          }
        }
      }
    }

    return { digest, status, error: statusError };
  }, [client, sleep]);

  // Find Market object for a given wallet address
  // Uses originalPackageId to find markets created before any upgrades
  const findMarketByOwner = useCallback(async (ownerAddress: string): Promise<MarketInfo | null> => {
    if (!originalPackageId || originalPackageId === '0x0') {
      console.warn('Package ID not configured');
      return null;
    }

    if (!ownerAddress) {
      console.warn('Owner address not provided');
      return null;
    }

    console.log('Finding market for owner:', ownerAddress, 'with originalPackageId:', originalPackageId);

    try {
      // First try: Query owned objects (works for owned markets - current deployment)
      try {
        const objects = await client.getOwnedObjects({
          owner: ownerAddress,
          filter: {
            StructType: `${originalPackageId}::share_market::Market`,
          },
          options: {
            showContent: true,
          },
        });

        console.log('Owned objects query result:', objects.data.length, 'markets found');

        if (objects.data.length > 0) {
          const marketObj = objects.data[0];
          if (marketObj.data?.objectId) {
            const content = marketObj.data.content as any;
            const holders = content?.fields?.holders ? Number(content.fields.holders) : 1;
            const graduated = content?.fields?.graduated === true;

            console.log('Found owned market:', marketObj.data.objectId, 'with', holders, 'holders, graduated:', graduated);

            return {
              objectId: marketObj.data.objectId,
              owner: ownerAddress,
              holders,
              graduated,
              packageId: originalPackageId,
            };
          }
        }
      } catch (ownedErr) {
        console.warn('Owned objects query failed:', ownedErr);
      }

      // Second try: Query SharePurchased events and filter client-side for this owner.
      // Note: compound All/Sender filters are not supported by the testnet RPC.
      try {
        const events = await client.queryEvents({
          query: {
            MoveEventType: `${originalPackageId}::share_market::SharePurchased`,
          },
          order: 'descending',
          limit: 100,
        });

        console.log('Events query result:', events.data.length, 'events found');

        for (const event of events.data) {
          const parsedJson = event.parsedJson as any;
          // The market-creation event has creator == buyer == ownerAddress
          if (parsedJson?.creator === ownerAddress && parsedJson?.buyer === ownerAddress) {
            const marketId = parsedJson.market_id;
            if (marketId) {
              try {
                const marketObj = await client.getObject({
                  id: marketId,
                  options: { showContent: true },
                });

                if (marketObj.data?.content) {
                  const content = marketObj.data.content as any;
                  const holders = content?.fields?.holders ? Number(content.fields.holders) : 1;
                  const graduated = content?.fields?.graduated === true;

                  console.log('Found market via events:', marketId, 'with', holders, 'holders, graduated:', graduated);

                  return {
                    objectId: marketId,
                    owner: ownerAddress,
                    holders,
                    graduated,
                    packageId: originalPackageId,
                  };
                }
              } catch (objErr) {
                console.warn('Failed to fetch market object:', objErr);
              }
            }
          }
        }
      } catch (eventErr) {
        console.warn('Events query failed:', eventErr);
      }

      console.log('No market found for owner:', ownerAddress);
      return null;
    } catch (err) {
      console.error('Failed to find market:', err);
      return null;
    }
  }, [client, originalPackageId]);

  // Buy a share in a market.
  // marketPackageId: the package the market was created under (may differ from current packageId
  // after a --fresh redeployment). Defaults to the current packageId when not provided.
  const buyShare = useCallback(async (
    marketObjectId: string,
    currentHolders: number,
    marketPackageId?: string,
  ): Promise<{ success: boolean; error?: string; txDigest?: string }> => {
    if (!account) {
      return { success: false, error: 'Wallet not connected' };
    }

    // Use the market's own package to call buy_share so old markets remain purchasable
    const callPackageId = marketPackageId || packageId;
    if (!callPackageId || callPackageId === '0x0') {
      return { success: false, error: 'Contracts not deployed' };
    }

    if (currentHolders >= MAX_SUPPLY) {
      return { success: false, error: `Market is sold out (max ${MAX_SUPPLY} holders)` };
    }

    setLoading(true);
    setError(null);

    try {
      const tx = new Transaction();

      // Calculate price for the next holder position
      const price = calculatePriceMist(currentHolders + 1);
      // Add a small buffer for gas fluctuations
      const paymentAmount = price + 10_000n;

      // Split coin for payment
      const [paymentCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(paymentAmount.toString())]);

      // Call buy_share on the market's original package so the type matches
      tx.moveCall({
        target: `${callPackageId}::share_market::buy_share`,
        arguments: [
          tx.object(marketObjectId),
          paymentCoin,
        ],
      });

      const result = await new Promise<any>((resolve, reject) => {
        signAndExecute(
          {
            transaction: tx,
          },
          {
            onSuccess: resolve,
            onError: reject,
          }
        );
      });

      const txStatus = await resolveTxStatus(result);
      if (txStatus.status && txStatus.status !== 'success') {
        const errorMsg = txStatus.error || 'Transaction failed';
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }
      if (!txStatus.status && !txStatus.digest) {
        const errorMsg = 'Transaction response missing digest/status';
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }

      console.log('Share purchased successfully:', txStatus.digest ?? result?.digest);
      return { success: true, txDigest: txStatus.digest ?? result?.digest };
    } catch (err: any) {
      console.error('Failed to buy share:', err);
      const errorMsg = err.message || 'Failed to purchase share';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setLoading(false);
    }
  }, [account, packageId, resolveTxStatus, signAndExecute]);

  // Sell a share in a market.
  // marketPackageId: the package the market was created under (may differ from current packageId
  // after a --fresh redeployment). Defaults to the current packageId when not provided.
  const sellShare = useCallback(async (
    marketObjectId: string,
    marketPackageId?: string,
  ): Promise<{ success: boolean; error?: string; txDigest?: string }> => {
    if (!account) {
      return { success: false, error: 'Wallet not connected' };
    }

    const callPackageId = marketPackageId || packageId;
    if (!callPackageId || callPackageId === '0x0') {
      return { success: false, error: 'Contracts not deployed' };
    }

    setLoading(true);
    setError(null);

    try {
      const tx = new Transaction();

      // Call sell_share on the market's original package so the type matches
      tx.moveCall({
        target: `${callPackageId}::share_market::sell_share`,
        arguments: [
          tx.object(marketObjectId),
        ],
      });

      const result = await new Promise<any>((resolve, reject) => {
        signAndExecute(
          {
            transaction: tx,
          },
          {
            onSuccess: resolve,
            onError: reject,
          }
        );
      });

      const txStatus = await resolveTxStatus(result);
      if (txStatus.status && txStatus.status !== 'success') {
        const errorMsg = txStatus.error || 'Transaction failed';
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }
      if (!txStatus.status && !txStatus.digest) {
        const errorMsg = 'Transaction response missing digest/status';
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }

      console.log('Share sold successfully:', txStatus.digest ?? result?.digest);
      return { success: true, txDigest: txStatus.digest ?? result?.digest };
    } catch (err: any) {
      console.error('Failed to sell share:', err);
      const errorMsg = err.message || 'Failed to sell share';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setLoading(false);
    }
  }, [account, packageId, resolveTxStatus, signAndExecute]);

  // Create a new market (creator must buy first share)
  const createMarket = useCallback(async (): Promise<{ success: boolean; error?: string; txDigest?: string; marketId?: string }> => {
    if (!account) {
      return { success: false, error: 'Wallet not connected' };
    }

    if (!packageId || packageId === '0x0') {
      return { success: false, error: 'Contracts not deployed' };
    }

    setLoading(true);
    setError(null);

    try {
      const tx = new Transaction();

      // Creator must pay for first share
      const firstSharePrice = calculatePriceMist(1);
      const paymentAmount = firstSharePrice + 10_000n;

      const [paymentCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(paymentAmount.toString())]);

      tx.moveCall({
        target: `${packageId}::share_market::create_market`,
        arguments: [
          paymentCoin,
        ],
      });

      const result = await new Promise<any>((resolve, reject) => {
        signAndExecute(
          {
            transaction: tx,
          },
          {
            onSuccess: resolve,
            onError: reject,
          }
        );
      });

      const txStatus = await resolveTxStatus(result);
      if (txStatus.status && txStatus.status !== 'success') {
        const errorMsg = txStatus.error || 'Transaction failed';
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }
      if (!txStatus.status && !txStatus.digest) {
        const errorMsg = 'Transaction response missing digest/status';
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }

      // Find the created Market object ID from object changes
      let marketId: string | undefined;
      let objectChanges = result.objectChanges;
      if (!objectChanges && txStatus.digest) {
        try {
          const txBlock = await client.getTransactionBlock({
            digest: txStatus.digest,
            options: { showObjectChanges: true },
          });
          objectChanges = txBlock.objectChanges;
        } catch (fetchErr) {
          console.warn('Failed to fetch object changes for create market tx:', fetchErr);
        }
      }

      if (objectChanges) {
        const createdMarket = objectChanges.find(
          (change: any) => change.type === 'created' && change.objectType?.includes('::share_market::Market')
        );
        if (createdMarket) {
          marketId = createdMarket.objectId;
        }
      }

      console.log('Market created successfully:', txStatus.digest ?? result?.digest);
      return { success: true, txDigest: txStatus.digest ?? result?.digest, marketId };
    } catch (err: any) {
      console.error('Failed to create market:', err);
      const errorMsg = err.message || 'Failed to create market';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setLoading(false);
    }
  }, [account, client, packageId, resolveTxStatus, signAndExecute]);

  // Check if the current user holds a share in a market
  const checkHolderStatus = useCallback(async (
    marketObjectId: string,
  ): Promise<boolean> => {
    if (!account?.address) {
      return false;
    }

    try {
      // Query the positions Table for the user's address as a dynamic field
      const result = await client.getDynamicFieldObject({
        parentId: marketObjectId,
        name: {
          type: 'address',
          value: account.address,
        },
      });

      return !!result.data;
    } catch (err: any) {
      // getDynamicFieldObject throws when the field doesn't exist
      if (err?.code === -32602 || err?.message?.includes('Cannot find dynamic field')) {
        return false;
      }
      console.error('Failed to check holder status:', err);
      return false;
    }
  }, [account, client]);

  return {
    loading,
    error,
    findMarketByOwner,
    buyShare,
    sellShare,
    createMarket,
    checkHolderStatus,
    calculatePriceMist,
    formatMistToSui,
    maxSupply: MAX_SUPPLY,
  };
}
