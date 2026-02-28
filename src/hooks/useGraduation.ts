import { useState, useEffect, useCallback } from 'react';
import { useCurrentAccount, useSignAndExecuteTransaction, useSignPersonalMessage, useSuiClient } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { useShareMarket, calculatePriceMist } from './useShareMarket';
import { useContractAddresses } from './useContractsSocial';
import { apiService } from '../lib/api';
import {
  type GraduationState,
  type GraduationConfig,
  GRADUATION_THRESHOLD,
  getMarketPhase,
} from '../lib/graduation';

const STORAGE_KEY_PREFIX = 'cord_graduation_';

function getStorageKey(ownerAddress: string): string {
  return `${STORAGE_KEY_PREFIX}${ownerAddress}`;
}

interface StoredGraduation {
  tokenName: string;
  tokenSymbol: string;
  tokenPackageId?: string;
  tokenType?: string;
  tokenVaultId?: string;
  graduatedAt: number;
  treasuryBalanceMist: string; // bigint serialized as string
}

function loadGraduation(ownerAddress: string): StoredGraduation | null {
  try {
    const raw = localStorage.getItem(getStorageKey(ownerAddress));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveGraduation(ownerAddress: string, data: StoredGraduation): void {
  localStorage.setItem(getStorageKey(ownerAddress), JSON.stringify(data));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeAddress(value: string): string {
  return value.startsWith('0x') ? value : `0x${value}`;
}

function normalizeOwnerAddressForBuildAuth(value: string): string {
  const stripped = value.trim().toLowerCase().replace(/^0x/, '');
  return `0x${stripped.padStart(64, '0')}`;
}

function generateBuildAuthNonce(): string {
  const random = new Uint8Array(16);
  crypto.getRandomValues(random);
  return Array.from(random)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function buildCreatorTokenAuthMessage(
  ownerAddress: string,
  tokenName: string,
  tokenSymbol: string,
  authTimestampMs: number,
  authNonce: string,
): string {
  return `Cord Creator Token Build Authorization\n\nOwner: ${ownerAddress}\nToken Name: ${tokenName}\nToken Symbol: ${tokenSymbol}\nTimestamp: ${authTimestampMs}\nNonce: ${authNonce}\n\nSign this message to authorize creator token package compilation.`;
}

/** Calculate total treasury from all share purchases (sum of bonding curve prices). */
function calculateTreasury(holders: number): bigint {
  let total = 0n;
  for (let i = 1; i <= holders; i++) {
    total += calculatePriceMist(i);
  }
  return total;
}

export function useGraduation(ownerAddress?: string | null) {
  const { findMarketByOwner } = useShareMarket();
  const { packageId, graduationRegistryId } = useContractAddresses();
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const { mutate: signPersonalMessage } = useSignPersonalMessage();
  const [isLoading, setIsLoading] = useState(true);
  const [holdersCount, setHoldersCount] = useState(0);
  const [marketFound, setMarketFound] = useState(false);
  const [marketGraduated, setMarketGraduated] = useState(false);
  const [stored, setStored] = useState<StoredGraduation | null>(null);

  const executeTransaction = useCallback(
    async (transaction: Transaction): Promise<any> =>
      new Promise((resolve, reject) => {
        signAndExecute(
          { transaction },
          {
            onSuccess: resolve,
            onError: reject,
          },
        );
      }),
    [signAndExecute],
  );

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

  const resolveTxStatus = useCallback(
    async (result: any): Promise<{ digest: string; status?: string; error?: string }> => {
      const digest = result?.digest as string | undefined;
      if (!digest) {
        throw new Error('Transaction did not return a digest');
      }

      let status = result?.effects?.status?.status as string | undefined;
      let statusError = result?.effects?.status?.error as string | undefined;
      let lookupError: string | undefined;

      if (!status) {
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
            lookupError = fetchErr?.message || String(fetchErr);
            if (attempt < 5) await delay(600);
          }
        }
      }

      return {
        digest,
        status,
        error: statusError || lookupError,
      };
    },
    [client],
  );

  const getTxBlockWithObjectChanges = useCallback(
    async (digest: string): Promise<any> => {
      let lastError: unknown;
      for (let attempt = 0; attempt < 6; attempt++) {
        try {
          return await client.getTransactionBlock({
            digest,
            options: {
              showEffects: true,
              showObjectChanges: true,
            },
          });
        } catch (err) {
          lastError = err;
          if (attempt < 5) await delay(600);
        }
      }
      throw new Error(
        `Failed to fetch transaction object changes: ${
          lastError instanceof Error ? lastError.message : String(lastError)
        }`,
      );
    },
    [client],
  );

  // Load localStorage on mount / address change
  useEffect(() => {
    if (!ownerAddress) {
      setStored(null);
      setIsLoading(false);
      return;
    }
    setStored(loadGraduation(ownerAddress));
  }, [ownerAddress]);

  // Fetch on-chain market data
  useEffect(() => {
    if (!ownerAddress) {
      setHoldersCount(0);
      setMarketFound(false);
      setMarketGraduated(false);
      setIsLoading(false);
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
          setMarketGraduated(!!market.graduated);
        } else {
          setHoldersCount(0);
          setMarketFound(false);
          setMarketGraduated(false);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setMarketFound(false);
        setMarketGraduated(false);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ownerAddress, findMarketByOwner]);

  // Derive graduation state.
  // Source of truth for "graduated/launched" is on-chain market.graduated.
  const graduationState: GraduationState | null = (() => {
    if (!ownerAddress || !marketFound) return null;

    const holders = Math.max(1, holdersCount);
    const treasury = calculateTreasury(holders);

    if (marketGraduated) {
      return {
        phase: 'graduated',
        holdersCount: holders,
        graduationThreshold: GRADUATION_THRESHOLD,
        treasuryBalanceMist: treasury,
        tokenName: stored?.tokenName,
        tokenSymbol: stored?.tokenSymbol,
        tokenPackageId: stored?.tokenPackageId,
        tokenType: stored?.tokenType,
        tokenVaultId: stored?.tokenVaultId,
        graduatedAt: stored?.graduatedAt,
        liquidityPooled: treasury,
      };
    }

    return {
      phase: getMarketPhase(holders),
      holdersCount: holders,
      graduationThreshold: GRADUATION_THRESHOLD,
      treasuryBalanceMist: treasury,
    };
  })();

  const triggerGraduation = useCallback(
    async (config: GraduationConfig) => {
      if (!ownerAddress) throw new Error('No owner address');
      if (!account?.address) throw new Error('Wallet not connected');
      if (account.address.toLowerCase() !== ownerAddress.toLowerCase()) {
        throw new Error('Only the market owner can launch this token');
      }
      if (!packageId || packageId === '0x0') {
        throw new Error('Contracts not deployed');
      }
      if (!graduationRegistryId || graduationRegistryId === '0x0') {
        throw new Error('Graduation registry is not configured. Redeploy contracts with graduation module enabled.');
      }

      const market = await findMarketByOwner(ownerAddress);
      if (!market) {
        throw new Error('Market not found for this user');
      }
      const alreadyLaunched =
        market.graduated && !!stored?.tokenPackageId && !!stored?.tokenType;
      if (alreadyLaunched) {
        throw new Error('Token has already been launched');
      }
      if (!market.graduated && market.holders < GRADUATION_THRESHOLD) {
        throw new Error(`Need at least ${GRADUATION_THRESHOLD} holders before launch`);
      }

      const rollbackGraduationIfNeeded = async (): Promise<void> => {
        const rollbackAmount = calculateTreasury(Math.max(1, market.holders));
        const rollbackTx = new Transaction();
        const [rollbackCoin] = rollbackTx.splitCoins(rollbackTx.gas, [
          rollbackTx.pure.u64(rollbackAmount.toString()),
        ]);
        rollbackTx.moveCall({
          target: `${packageId}::graduation::rollback_graduation`,
          arguments: [
            rollbackTx.object(graduationRegistryId),
            rollbackTx.object(market.objectId),
            rollbackCoin,
          ],
        });

        const rollbackResult = await executeTransaction(rollbackTx);
        const rollbackStatus = await resolveTxStatus(rollbackResult);
        if (rollbackStatus.status && rollbackStatus.status !== 'success') {
          throw new Error(rollbackStatus.error || 'Graduation rollback failed');
        }

        // Confirm state eventually flips back to non-graduated.
        for (let attempt = 0; attempt < 6; attempt++) {
          const refreshed = await findMarketByOwner(ownerAddress);
          if (refreshed && !refreshed.graduated) {
            setMarketGraduated(false);
            return;
          }
          await delay(600);
        }
      };

      let registerSucceeded = false;
      let shouldRollbackOnFailure = market.graduated && !alreadyLaunched;

      try {
        // 1) Ask backend to generate + compile creator token package template.
        const normalizedOwnerAddress = normalizeOwnerAddressForBuildAuth(ownerAddress);
        const normalizedTokenName = config.tokenName.trim();
        const normalizedTokenSymbol = config.tokenSymbol.trim().toUpperCase();
        const authTimestampMs = Date.now();
        const authNonce = generateBuildAuthNonce();
        const authMessage = buildCreatorTokenAuthMessage(
          normalizedOwnerAddress,
          normalizedTokenName,
          normalizedTokenSymbol,
          authTimestampMs,
          authNonce,
        );
        const authSignature = await signAuthMessage(authMessage);

        const buildResponse = await apiService.buildCreatorTokenPackage({
          owner_address: normalizedOwnerAddress,
          token_name: normalizedTokenName,
          token_symbol: normalizedTokenSymbol,
          auth_nonce: authNonce,
          auth_timestamp_ms: authTimestampMs,
          auth_signature: authSignature,
        });
        if (!buildResponse.success || !buildResponse.data) {
          throw new Error(buildResponse.error || 'Failed to build creator token package');
        }
        const buildData = buildResponse.data;
        const normalizedSymbol = buildData.token_symbol.toUpperCase();

        // 2) Publish creator token package.
        const publishTx = new Transaction();
        const publishResultValue = publishTx.publish({
          modules: buildData.modules,
          dependencies: buildData.dependencies,
        });
        publishTx.transferObjects([publishResultValue], publishTx.pure.address(account.address));

        const publishResult = await executeTransaction(publishTx);
        const publishStatus = await resolveTxStatus(publishResult);
        if (publishStatus.status && publishStatus.status !== 'success') {
          throw new Error(publishStatus.error || 'Creator token package publish failed');
        }

        const publishBlock = await getTxBlockWithObjectChanges(publishStatus.digest);
        const objectChanges = (publishBlock?.objectChanges ?? []) as Array<any>;
        const published = objectChanges.find((change) => change.type === 'published' && typeof change.packageId === 'string');
        if (!published?.packageId) {
          throw new Error('Published package ID not found in publish transaction');
        }
        const creatorPackageId = normalizeAddress(published.packageId);
        const tokenType = `${creatorPackageId}::${buildData.module_name}::${buildData.type_name}`;

        // TreasuryCap<tokenType> should be created by module init and owned by publisher.
        let treasuryCapId: string | undefined = objectChanges
          .find(
            (change) =>
              change.type === 'created' &&
              typeof change.objectType === 'string' &&
              change.objectType === `0x2::coin::TreasuryCap<${tokenType}>` &&
              typeof change.objectId === 'string',
          )
          ?.objectId;

        if (!treasuryCapId) {
          const ownedCaps = await client.getOwnedObjects({
            owner: account.address,
            filter: {
              StructType: `0x2::coin::TreasuryCap<${tokenType}>`,
            },
            options: {
              showType: true,
            },
          });
          treasuryCapId = ownedCaps.data[0]?.data?.objectId;
        }

        if (!treasuryCapId) {
          throw new Error(`TreasuryCap for ${tokenType} not found after publish`);
        }

        // 3) Finalize market graduation on-chain if this is a fresh launch.
        if (!market.graduated) {
          const graduateTx = new Transaction();
          graduateTx.moveCall({
            target: `${packageId}::graduation::graduate`,
            arguments: [graduateTx.object(graduationRegistryId), graduateTx.object(market.objectId)],
          });
          const graduateResult = await executeTransaction(graduateTx);
          const graduateStatus = await resolveTxStatus(graduateResult);

          let graduationSucceeded = graduateStatus.status === 'success';
          if (!graduationSucceeded) {
            for (let attempt = 0; attempt < 6; attempt++) {
              const refreshed = await findMarketByOwner(ownerAddress);
              if (refreshed?.graduated) {
                graduationSucceeded = true;
                break;
              }
              await delay(600);
            }
          }
          if (!graduationSucceeded) {
            throw new Error(graduateStatus.error || 'On-chain launch transaction failed');
          }
          shouldRollbackOnFailure = true;
        }

        // 4) Register TreasuryCap<T> in shared graduation registry.
        const registerTx = new Transaction();
        const encoder = new TextEncoder();
        registerTx.moveCall({
          target: `${packageId}::graduation::register_creator_token`,
          typeArguments: [tokenType],
          arguments: [
            registerTx.object(graduationRegistryId),
            registerTx.object(market.objectId),
            registerTx.object(treasuryCapId),
            registerTx.pure.vector('u8', Array.from(encoder.encode(normalizedSymbol))),
            registerTx.pure.vector('u8', Array.from(encoder.encode(buildData.token_name))),
          ],
        });

        const registerResult = await executeTransaction(registerTx);
        const registerStatus = await resolveTxStatus(registerResult);
        if (registerStatus.status && registerStatus.status !== 'success') {
          throw new Error(registerStatus.error || 'TreasuryCap registration failed');
        }
        registerSucceeded = true;

        const registerBlock = await getTxBlockWithObjectChanges(registerStatus.digest);
        const registerChanges = (registerBlock?.objectChanges ?? []) as Array<any>;
        const vaultId: string | undefined = registerChanges
          .find(
            (change) =>
              change.type === 'created' &&
              typeof change.objectType === 'string' &&
              change.objectType.includes('::graduation::CreatorTokenVault<') &&
              typeof change.objectId === 'string',
          )
          ?.objectId;

        const treasury = calculateTreasury(Math.max(1, market.holders));
        const data: StoredGraduation = {
          tokenName: buildData.token_name,
          tokenSymbol: normalizedSymbol,
          tokenPackageId: creatorPackageId,
          tokenType,
          tokenVaultId: vaultId,
          graduatedAt: Date.now(),
          treasuryBalanceMist: treasury.toString(),
        };

        saveGraduation(ownerAddress, data);
        setStored(data);
        setHoldersCount(market.holders);
        setMarketFound(true);
        setMarketGraduated(true);
      } catch (error: any) {
        const baseMessage = error?.message || 'Token launch failed';
        if (!registerSucceeded && shouldRollbackOnFailure) {
          let rollbackSucceeded = false;
          try {
            await rollbackGraduationIfNeeded();
            rollbackSucceeded = true;
          } catch (rollbackError: any) {
            const rollbackMessage = rollbackError?.message || 'unknown rollback error';
            throw new Error(`${baseMessage}. Rollback failed: ${rollbackMessage}`);
          }
          if (rollbackSucceeded) {
            throw new Error(`${baseMessage}. Graduation was rolled back; you can retry launch.`);
          }
        }
        throw new Error(baseMessage);
      }
    },
    [
      ownerAddress,
      account?.address,
      packageId,
      graduationRegistryId,
      findMarketByOwner,
      executeTransaction,
      signAuthMessage,
      resolveTxStatus,
      getTxBlockWithObjectChanges,
      client,
      stored?.tokenPackageId,
      stored?.tokenType,
    ],
  );

  return { graduationState, isLoading, triggerGraduation };
}
