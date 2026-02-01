import { useState, useCallback, useEffect } from 'react';
import { 
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
  useSuiClientQuery
} from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { SUI_CLOCK_OBJECT_ID } from '@mysten/sui/utils';
import { useContractAddresses } from './useContractsSocial';

// Constants from the contract (share_market.move)
// Bonding curve: p(x) = 0.02 + 0.35/(x+3) + 1/(38-x) SUI
const MIST_PER_SUI = 1_000_000_000;
const PRICE_BASE = 20_000_000n;         // 0.02 SUI in MIST
const PRICE_TERM1_NUM = 350_000_000n;   // 0.35 SUI numerator
const PRICE_TERM2_NUM = 1_000_000_000n; // 1.0 SUI numerator
const TERM1_OFFSET = 3n;                // x + 3
const TERM2_DENOM_BASE = 38n;           // 38 - x

export interface FollowProfile {
  id: string;
  owner: string;
  followBookId: string;
  marketId: string;
  followerCount: number;
  followingCount: number;
  sponsorLeft: number;
  username: string;
  bio: string;
  avatarUrl: string;
  currentPrice?: bigint;
  nextPrice?: bigint;
}

export interface FollowStats {
  isFollowing: boolean;
  followerCount: number;
  followingCount: number;
  currentPrice: bigint;
  nextPrice: bigint;
  sponsorLeft: number;
}

// Calculate price in MIST for x-th holder/share using bonding curve from contract
// p(x) = 0.02 + 0.35/(x+3) + 1/(38-x) SUI
export function calculatePriceMist(x: number): bigint {
  if (x < 1) x = 1;
  if (x > 30) x = 30;
  const xBig = BigInt(x);
  const term1 = PRICE_TERM1_NUM / (xBig + TERM1_OFFSET);
  const term2 = PRICE_TERM2_NUM / (TERM2_DENOM_BASE - xBig);
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


export function useSocialFollow() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const { packageId } = useContractAddresses();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // State for user's profile
  const [userProfile, setUserProfile] = useState<FollowProfile | null>(null);
  const [followingList, setFollowingList] = useState<string[]>([]);
  
  // Update user profile with current and next price
  useEffect(() => {
    if (userProfile) {
      const currentPrice = calculatePriceMist(userProfile.followerCount);
      const nextPrice = calculatePriceMist(userProfile.followerCount + 1);
      setUserProfile(prev => prev ? {...prev, currentPrice, nextPrice} : null);
    }
  }, [userProfile?.followerCount]);
  
  // Use package ID from contract addresses hook
  const PACKAGE_ID = packageId;

  // Create profile (FollowBook + Market)
  // Only requires username (token name) - cannot be changed later
  const createProfile = useCallback(async (username: string) => {
    if (!account) {
      setError('Wallet not connected');
      throw new Error('Wallet not connected');
    }

    if (!PACKAGE_ID || PACKAGE_ID === '0x0' || PACKAGE_ID === '0x0000000000000000000000000000000000000000000000000000000000000000') {
      const errorMessage = 'Contracts not deployed. Please ensure contracts are deployed on the network.';
      setError(errorMessage);
      throw new Error(errorMessage);
    }

    // Log for debugging
    console.log('Creating profile with:', {
      packageId: PACKAGE_ID,
      usernameLength: username.length,
      walletAddress: account.address,
      rpcUrl: client.url
    });

    setLoading(true);
    setError(null);

    try {
      const tx = new Transaction();

      const firstSharePrice = calculatePriceMist(1);
      const paymentAmount = firstSharePrice + 1_000n;
      const [paymentCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(paymentAmount.toString())]);

      tx.moveCall({
        target: `${PACKAGE_ID}::share_market::create_market`,
        arguments: [
          paymentCoin,
        ],
      });

      const result = await new Promise<any>((resolve, reject) => {
        signAndExecute(
          {
            transaction: tx,
            options: {
              showEffects: true,
              showEvents: true,
            },
          },
          {
            onSuccess: resolve,
            onError: reject,
          }
        );
      });

      if (result?.effects?.status?.status && result.effects.status.status !== 'success') {
        throw new Error(`Transaction failed: ${result.effects.status.status}`);
      }

      console.log('Profile created successfully:', result);
      fetchUserProfile();
    } catch (err: any) {
      console.error('Error creating profile:', err);
      setError(err.message || 'Failed to create profile');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [account, signAndExecute, PACKAGE_ID]);

  // Follow a user (buy key)
  const followUser = useCallback(async (
    targetMarketId: string,
    targetProfileId: string,
    currentSupply: number
  ) => {
    if (!account || !userProfile) {
      setError('Profile not initialized');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const tx = new Transaction();
      
      // Check if we have sponsored follows left
      const hasSponsored = userProfile.sponsorLeft > 0;
      
      if (hasSponsored) {
        // Use sponsored follow (free)
        tx.moveCall({
          target: `${PACKAGE_ID}::social_follow::sponsored_buy_key`,
          arguments: [
            tx.object(userProfile.followBookId),
            tx.object(targetMarketId),
          ],
        });
      } else {
        // Calculate price for paid follow
        const price = calculatePriceMist(currentSupply + 1);
        const paymentAmount = price + BigInt(1000); // Add small buffer for gas
        
        // Split coin for payment
        const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(paymentAmount.toString())]);
        
        // Use paid follow
        tx.moveCall({
          target: `${PACKAGE_ID}::social_follow::buy_key`,
          arguments: [
            tx.object(userProfile.followBookId),
            tx.object(targetMarketId),
            coin,
          ],
        });
      }

      await signAndExecute(
        {
          transaction: tx,
          options: {
            showEffects: true,
            showEvents: true,
          },
        },
        {
          onSuccess: (result) => {
            console.log('Successfully followed user:', result);
            
            // Update local state
            setFollowingList(prev => [...prev, targetProfileId]);
            if (hasSponsored) {
              setUserProfile(prev => prev ? {
                ...prev,
                sponsorLeft: prev.sponsorLeft - 1,
                followingCount: prev.followingCount + 1
              } : null);
            } else {
              setUserProfile(prev => prev ? {
                ...prev,
                followingCount: prev.followingCount + 1
              } : null);
            }
            
            // Store in localStorage for persistence
            if (account.address) {
              const key = `following_${account.address}`;
              localStorage.setItem(key, JSON.stringify([...followingList, targetProfileId]));
            }
          },
          onError: (error) => {
            console.error('Failed to follow user:', error);
            setError(error.message);
          },
        }
      );
    } catch (err: any) {
      console.error('Error following user:', err);
      setError(err.message || 'Failed to follow user');
    } finally {
      setLoading(false);
    }
  }, [account, userProfile, signAndExecute, followingList, PACKAGE_ID]);

  // Unfollow a user (sell key)
  const unfollowUser = useCallback(async (
    targetMarketId: string,
    targetProfileId: string
  ) => {
    if (!account || !userProfile) {
      setError('Profile not initialized');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const tx = new Transaction();
      
      // Call sell_key to unfollow
      tx.moveCall({
        target: `${PACKAGE_ID}::social_follow::sell_key`,
        arguments: [
          tx.object(userProfile.followBookId),
          tx.object(targetMarketId),
        ],
      });

      await signAndExecute(
        {
          transaction: tx,
          options: {
            showEffects: true,
            showEvents: true,
          },
        },
        {
          onSuccess: (result) => {
            console.log('Successfully unfollowed user:', result);
            
            // Update local state
            setFollowingList(prev => prev.filter(id => id !== targetProfileId));
            setUserProfile(prev => prev ? {
              ...prev,
              followingCount: prev.followingCount - 1
            } : null);
            
            // Update localStorage
            if (account.address) {
              const key = `following_${account.address}`;
              const updated = followingList.filter(id => id !== targetProfileId);
              localStorage.setItem(key, JSON.stringify(updated));
            }
          },
          onError: (error) => {
            console.error('Failed to unfollow user:', error);
            setError(error.message);
          },
        }
      );
    } catch (err: any) {
      console.error('Error unfollowing user:', err);
      setError(err.message || 'Failed to unfollow user');
    } finally {
      setLoading(false);
    }
  }, [account, userProfile, signAndExecute, followingList, PACKAGE_ID]);

  // Batch follow multiple users
  const batchFollowUsers = useCallback(async (
    targets: Array<{ marketId: string; profileId: string; supply: number }>
  ) => {
    if (!account || !userProfile) {
      setError('Profile not initialized');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const tx = new Transaction();
      
      // Prepare markets and payments arrays
      const markets: any[] = [];
      const payments: any[] = [];
      let totalCost = BigInt(0);
      
      for (const target of targets) {
        markets.push(tx.object(target.marketId));
        
        // Calculate price for each follow
        const price = calculatePriceMist(target.supply + 1);
        totalCost += price;
        
        // Split coin for each payment
        const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(price.toString())]);
        payments.push(coin);
      }

      // Call batch_buy_keys
      tx.moveCall({
        target: `${PACKAGE_ID}::social_follow::batch_buy_keys`,
        arguments: [
          tx.object(userProfile.followBookId),
          tx.makeVec(markets),
          tx.makeVec(payments),
        ],
      });

      await signAndExecute(
        {
          transaction: tx,
          options: {
            showEffects: true,
            showEvents: true,
          },
        },
        {
          onSuccess: (result) => {
            console.log('Successfully batch followed users:', result);
            
            // Update local state
            const newFollows = targets.map(t => t.profileId);
            setFollowingList(prev => [...prev, ...newFollows]);
            setUserProfile(prev => prev ? {
              ...prev,
              followingCount: prev.followingCount + targets.length
            } : null);
          },
          onError: (error) => {
            console.error('Failed to batch follow users:', error);
            setError(error.message);
          },
        }
      );
    } catch (err: any) {
      console.error('Error batch following users:', err);
      setError(err.message || 'Failed to batch follow users');
    } finally {
      setLoading(false);
    }
  }, [account, userProfile, signAndExecute, PACKAGE_ID]);

  // Fetch user's profile data
  const fetchUserProfile = useCallback(async () => {
    if (!account) return;

    try {
      // Query user's FollowBook and Market objects
      const objects = await client.getOwnedObjects({
        owner: account.address,
        filter: {
          StructType: `${PACKAGE_ID}::social_follow::FollowBook`,
        },
      });

      if (objects.data.length > 0) {
        const followBook = await client.getObject({
          id: objects.data[0].data?.objectId!,
          options: { showContent: true },
        });

        // Parse the FollowBook data
        const content = followBook.data?.content as any;
        if (content) {
          // Mock profile data (would come from actual object in production)
          setUserProfile({
            id: account.address,
            owner: account.address,
            followBookId: objects.data[0].data?.objectId!,
            marketId: '', // Would fetch Market object similarly
            followerCount: 0,
            followingCount: content.fields.following_count || 0,
            sponsorLeft: content.fields.sponsor_left || 0,
            username: account.address.slice(0, 8),
            bio: '',
            avatarUrl: '',
          });
        }
      }
    } catch (err) {
      console.error('Error fetching user profile:', err);
    }
  }, [account, client, PACKAGE_ID]);

  // Load following list from localStorage
  const loadFollowingList = useCallback(() => {
    if (!account) return;
    
    const key = `following_${account.address}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        setFollowingList(JSON.parse(saved));
      } catch (err) {
        console.error('Error loading following list:', err);
      }
    }
  }, [account]);

  // Check if user is following someone
  const isFollowing = useCallback((profileId: string): boolean => {
    return followingList.includes(profileId);
  }, [followingList]);

  // Get follow stats for a profile
  const getFollowStats = useCallback((supply: number): FollowStats => {
    return {
      isFollowing: false, // Would check against actual profile
      followerCount: supply,
      followingCount: 0,
      currentPrice: calculatePriceMist(supply),
      nextPrice: calculatePriceMist(supply + 1),
      sponsorLeft: userProfile?.sponsorLeft || 0,
    };
  }, [userProfile]);

  // Initialize on mount
  useEffect(() => {
    if (account) {
      fetchUserProfile();
      loadFollowingList();
    }
  }, [account, fetchUserProfile, loadFollowingList]);

  return {
    // State
    loading,
    error,
    userProfile,
    followingList,
    
    // Actions
    createProfile,
    followUser,
    unfollowUser,
    batchFollowUsers,
    
    // Utilities
    isFollowing,
    getFollowStats,
    calculatePriceMist,
    formatMistToSui,
  };
}
