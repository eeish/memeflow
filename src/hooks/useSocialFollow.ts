import { useState, useCallback, useEffect } from 'react';
import { useSuiClient } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { useContractAddresses } from './useContractsSocial';
import { MAX_SUPPLY, TERM2_DENOM_BASE } from '../lib/graduation';
import { useActiveAddress } from './useActiveAddress';
import { useTransactionExecutor } from './useTransactionExecutor';

// Constants from the contract (share_market.move)
// Bonding curve: p(x) = 0.02 + 0.35/(x+3) + 1/(TERM2_DENOM_BASE-x) SUI
const MIST_PER_SUI = 1_000_000_000;
const PRICE_BASE = 20_000_000n;         // 0.02 SUI in MIST
const PRICE_TERM1_NUM = 350_000_000n;   // 0.35 SUI numerator
const PRICE_TERM2_NUM = 1_000_000_000n; // 1.0 SUI numerator
const TERM1_OFFSET = 3n;                // x + 3
const TERM2_DENOM_BASE_BIGINT = BigInt(TERM2_DENOM_BASE);

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
// p(x) = 0.02 + 0.35/(x+3) + 1/(TERM2_DENOM_BASE-x) SUI
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


export function useSocialFollow() {
  const activeAddress = useActiveAddress();
  const client = useSuiClient();
  const { executeTransaction } = useTransactionExecutor();
  // packageId = latest version for calling functions
  // originalPackageId = first deployment for querying existing objects
  const { packageId, originalPackageId } = useContractAddresses();

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
  // PACKAGE_ID for calling functions (latest version)
  const PACKAGE_ID = packageId;
  // ORIGINAL_PACKAGE_ID for querying existing objects
  const ORIGINAL_PACKAGE_ID = originalPackageId;

  // Create profile (FollowBook + Market)
  // Only requires username (token name) - cannot be changed later
  const createProfile = useCallback(async (username: string) => {
    if (!activeAddress) {
      setError('Please sign in to continue');
      throw new Error('Please sign in to continue');
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
      walletAddress: activeAddress,
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

      const result = await executeTransaction({
        transaction: tx,
        options: {
          showEffects: true,
          showEvents: true,
        },
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
  }, [activeAddress, client.url, executeTransaction, PACKAGE_ID]);

  // Follow a user (buy key)
  const followUser = useCallback(async (
    targetMarketId: string,
    targetProfileId: string,
    currentSupply: number
  ) => {
    if (!activeAddress || !userProfile) {
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

      const result = await executeTransaction({
        transaction: tx,
        options: {
          showEffects: true,
          showEvents: true,
        },
      });

      console.log('Successfully followed user:', result);

      const updatedFollowing = [...followingList, targetProfileId];
      setFollowingList(updatedFollowing);
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

      const key = `following_${activeAddress}`;
      localStorage.setItem(key, JSON.stringify(updatedFollowing));
    } catch (err: any) {
      console.error('Error following user:', err);
      setError(err.message || 'Failed to follow user');
    } finally {
      setLoading(false);
    }
  }, [activeAddress, userProfile, executeTransaction, followingList, PACKAGE_ID]);

  // Unfollow a user (sell key)
  const unfollowUser = useCallback(async (
    targetMarketId: string,
    targetProfileId: string
  ) => {
    if (!activeAddress || !userProfile) {
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

      const result = await executeTransaction({
        transaction: tx,
        options: {
          showEffects: true,
          showEvents: true,
        },
      });

      console.log('Successfully unfollowed user:', result);

      const updatedFollowing = followingList.filter(id => id !== targetProfileId);
      setFollowingList(updatedFollowing);
      setUserProfile(prev => prev ? {
        ...prev,
        followingCount: prev.followingCount - 1
      } : null);

      const key = `following_${activeAddress}`;
      localStorage.setItem(key, JSON.stringify(updatedFollowing));
    } catch (err: any) {
      console.error('Error unfollowing user:', err);
      setError(err.message || 'Failed to unfollow user');
    } finally {
      setLoading(false);
    }
  }, [activeAddress, userProfile, executeTransaction, followingList, PACKAGE_ID]);

  // Batch follow multiple users
  const batchFollowUsers = useCallback(async (
    targets: Array<{ marketId: string; profileId: string; supply: number }>
  ) => {
    if (!activeAddress || !userProfile) {
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
      for (const target of targets) {
        markets.push(tx.object(target.marketId));
        
        // Calculate price for each follow
        const price = calculatePriceMist(target.supply + 1);
        
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

      const result = await executeTransaction({
        transaction: tx,
        options: {
          showEffects: true,
          showEvents: true,
        },
      });

      console.log('Successfully batch followed users:', result);

      const newFollows = targets.map(t => t.profileId);
      const updatedFollowing = [...followingList, ...newFollows];
      setFollowingList(updatedFollowing);
      setUserProfile(prev => prev ? {
        ...prev,
        followingCount: prev.followingCount + targets.length
      } : null);
      localStorage.setItem(`following_${activeAddress}`, JSON.stringify(updatedFollowing));
    } catch (err: any) {
      console.error('Error batch following users:', err);
      setError(err.message || 'Failed to batch follow users');
    } finally {
      setLoading(false);
    }
  }, [activeAddress, userProfile, executeTransaction, followingList, PACKAGE_ID]);

  // Fetch user's profile data
  const fetchUserProfile = useCallback(async () => {
    if (!activeAddress) return;
    if (
      !ORIGINAL_PACKAGE_ID ||
      ORIGINAL_PACKAGE_ID === '0x0' ||
      ORIGINAL_PACKAGE_ID === '0x0000000000000000000000000000000000000000000000000000000000000000'
    ) {
      return;
    }

    try {
      // Query user's FollowBook and Market objects
      // Use ORIGINAL_PACKAGE_ID since objects were created with the original package type
      const objects = await client.getOwnedObjects({
        owner: activeAddress,
        filter: {
          StructType: `${ORIGINAL_PACKAGE_ID}::social_follow::FollowBook`,
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
            id: activeAddress,
            owner: activeAddress,
            followBookId: objects.data[0].data?.objectId!,
            marketId: '', // Would fetch Market object similarly
            followerCount: 0,
            followingCount: content.fields.following_count || 0,
            sponsorLeft: content.fields.sponsor_left || 0,
            username: activeAddress.slice(0, 8),
            bio: '',
            avatarUrl: '',
          });
        }
      }
    } catch (err) {
      console.error('Error fetching user profile:', err);
    }
  }, [activeAddress, client, ORIGINAL_PACKAGE_ID]);

  // Load following list from localStorage
  const loadFollowingList = useCallback(() => {
    if (!activeAddress) return;
    
    const key = `following_${activeAddress}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        setFollowingList(JSON.parse(saved));
      } catch (err) {
        console.error('Error loading following list:', err);
      }
    }
  }, [activeAddress]);

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
    if (activeAddress && ORIGINAL_PACKAGE_ID) {
      fetchUserProfile();
      loadFollowingList();
    }
  }, [activeAddress, ORIGINAL_PACKAGE_ID, fetchUserProfile, loadFollowingList]);

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
