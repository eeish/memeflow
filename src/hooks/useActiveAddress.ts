import { useCurrentAccount } from '@mysten/dapp-kit';
import { useAuth } from '../components/AuthProvider';

export function useActiveAddress() {
  const account = useCurrentAccount();
  const { user } = useAuth();

  return user?.wallet_address || account?.address || null;
}
