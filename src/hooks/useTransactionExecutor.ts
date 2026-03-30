import { useCallback } from 'react';
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from '@mysten/dapp-kit';
import type { SuiTransactionBlockResponseOptions } from '@mysten/sui/client';
import type { Transaction } from '@mysten/sui/transactions';
import { useAuth } from '../components/AuthProvider';
import { executeZkLoginTransaction } from '../lib/zkLogin';

export function useTransactionExecutor() {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const { user } = useAuth();
  const { mutateAsync: signAndExecuteAsync } = useSignAndExecuteTransaction();

  const activeAddress = user?.wallet_address || account?.address || null;
  const isZkLogin = user?.authMethod === 'zklogin';

  const executeTransaction = useCallback(async (params: {
    transaction: Transaction;
    options?: SuiTransactionBlockResponseOptions;
  }) => {
    const { transaction, options } = params;

    if (!activeAddress) {
      throw new Error('Please sign in to continue');
    }

    transaction.setSenderIfNotSet(activeAddress);

    if (isZkLogin) {
      return executeZkLoginTransaction({
        client,
        transaction,
        sender: activeAddress,
        options,
      });
    }

    return signAndExecuteAsync({
      transaction,
      options,
    });
  }, [activeAddress, client, isZkLogin, signAndExecuteAsync]);

  return {
    activeAddress,
    executeTransaction,
    isZkLogin,
  };
}
