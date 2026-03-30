import { useCurrentAccount } from '@mysten/dapp-kit';
import { useAuth } from '../components/AuthProvider';

export function useActiveAddress() {
  const account = useCurrentAccount();
  const { user, pendingWalletAddress } = useAuth();

  return user?.wallet_address || pendingWalletAddress || account?.address || null;
}
