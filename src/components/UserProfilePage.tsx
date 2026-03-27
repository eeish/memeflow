import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { UserPlus, UserMinus, ShoppingCart, Loader2, Rocket } from './ui-simple/Icons';
import { Avatar, AvatarFallback, AvatarImage } from './ui-simple/Avatar';
import { Card } from './ui-simple/Card';
import type { UserSummary } from '../types/users.ts';
import { apiService, type PostWithAuthor, type User } from '../lib/api';
import type { FeedPostItem } from './feed/types';
import { FeedPostCard } from './feed/FeedPostCard';
import { formatTimeAgo, inferMediaType } from '../lib/feed';
import { useShareMarket, calculatePriceMist, formatMistToSui } from '../hooks/useShareMarket';
import { useGraduation } from '../hooks/useGraduation';
import { GRADUATION_THRESHOLD, MAX_SUPPLY, graduationProgressPercent } from '../lib/graduation';
import { useAuth } from './AuthProvider';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { useNotifications } from '../contexts/NotificationContext';
import { useSharePurchaseFeedback } from '../contexts/SharePurchaseFeedbackContext';
import { BuyShareDialog } from './BuyShareDialog';
import type { TradePageContext } from '../types/trade';

interface UserProfilePageProps {
  user: UserSummary;
  onOpenTrade?: (context: TradePageContext) => void;
}

export const UserProfilePage: React.FC<UserProfilePageProps> = ({ user, onOpenTrade }) => {
  const displayName = `@${user.username}`;
  const avatarFallback = user.username.charAt(0).toUpperCase();
  const [posts, setPosts] = useState<PostWithAuthor[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [postsError, setPostsError] = useState<string | null>(null);

  // Full profile data (for bio, wallet address, etc.)
  const [fullProfile, setFullProfile] = useState<User | null>(null);

  // Follow/Buy Share state
  const { user: currentUser } = useAuth();
  const currentAccount = useCurrentAccount();
  const { error: showError } = useNotifications();
  const { showSuccessReceipt } = useSharePurchaseFeedback();
  const { findMarketByOwner, buyShare, checkHolderStatus, loading: shareLoading } = useShareMarket();

  const [isFollowing, setIsFollowing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [followError, setFollowError] = useState<string | null>(null);

  // Buy share dialog state
  const [buyDialogOpen, setBuyDialogOpen] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [marketInfo, setMarketInfo] = useState<{ objectId: string; holders: number; graduated: boolean; packageId: string } | null>(null);
  const [isHolder, setIsHolder] = useState(false);

  // Check if viewing own profile
  const isOwnProfile = currentUser?.id === user.id;

  // Graduation state — on-chain `graduated` flag is the source of truth
  const { graduationState } = useGraduation(fullProfile?.wallet_address);
  const phase = graduationState?.phase ?? 'shares';
  const isGraduated = marketInfo?.graduated || phase === 'graduated';
  // graduationState.tokenSymbol is now resolved from the on-chain vault when localStorage is
  // absent (e.g. a viewer who is not the token launcher).  Never fall back to username —
  // the profile's token_symbol field is an unrelated placeholder often set to the username.
  const activeTokenSymbol = (graduationState?.tokenSymbol ?? '').replace('$', '').toUpperCase() || '…';
  const canTradeToken = !!onOpenTrade && isGraduated;

  // Get holders count from market info, full profile, or default to 1 (creator always holds first share)
  const rawHoldersCount = marketInfo?.holders ?? fullProfile?.followers_count ?? 0;
  // If user has a profile, they have a market, so minimum is 1
  const holdersCount = fullProfile ? Math.max(1, rawHoldersCount) : rawHoldersCount;

  // Whether shares can be purchased
  // Hide button when: market data not yet loaded, sold out, graduated, or already a holder
  const canBuyShare = !isOwnProfile && !!marketInfo && !isGraduated && !isHolder && holdersCount < MAX_SUPPLY;

  // Calculate share price
  const sharePrice = useMemo(() => {
    const mist = calculatePriceMist(holdersCount + 1);
    return formatMistToSui(mist);
  }, [holdersCount]);

  const handleOpenTrade = useCallback(() => {
    if (!onOpenTrade || !canTradeToken) return;
    onOpenTrade({
      tokenSymbol: activeTokenSymbol,
      username: user.username,
      creatorAddress: fullProfile?.wallet_address,
      tokenType: graduationState?.tokenType,
      poolId: graduationState?.poolId,
      source: 'profile',
    });
  }, [onOpenTrade, canTradeToken, activeTokenSymbol, user.username, fullProfile?.wallet_address, graduationState?.tokenType, graduationState?.poolId]);

  // Fetch market info and holder status when we have the wallet address
  useEffect(() => {
    if (!fullProfile?.wallet_address) return;

    let isMounted = true;
    const fetchMarketInfo = async () => {
      try {
        const market = await findMarketByOwner(fullProfile.wallet_address!);
        if (!isMounted) return;
        if (market) {
          setMarketInfo({ objectId: market.objectId, holders: market.holders, graduated: market.graduated, packageId: market.packageId });
          // Check if current user already holds a share
          const holds = await checkHolderStatus(market.objectId);
          if (isMounted) setIsHolder(holds);
        }
      } catch (err) {
        console.error('Failed to fetch market info:', err);
      }
    };

    fetchMarketInfo();
    return () => {
      isMounted = false;
    };
  }, [fullProfile?.wallet_address, findMarketByOwner, checkHolderStatus]);

  // Check follow status when component mounts or user changes
  useEffect(() => {
    if (!user.id || !currentUser?.id || isOwnProfile) return;

    const checkFollowStatus = async () => {
      try {
        const response = await apiService.getFollowStatus(user.id, currentUser.id);
        if (response.success && response.data) {
          setIsFollowing(response.data.is_following);
        }
      } catch (err) {
        console.error('Failed to check follow status:', err);
      }
    };

    checkFollowStatus();
  }, [user.id, currentUser?.id, isOwnProfile]);

  // Handle follow action (social follow - does NOT affect holder count or share price)
  const handleFollow = useCallback(async () => {
    if (!user.id || !currentUser?.id || isOwnProfile) return;

    setActionLoading(true);
    setFollowError(null);
    try {
      const response = await apiService.followUser(user.id, currentUser.id);
      if (response.success) {
        setIsFollowing(true);
      } else {
        setFollowError(response.error || 'Failed to follow');
        console.error('Follow failed:', response.error);
      }
    } catch (err) {
      console.error('Follow failed:', err);
      setFollowError('Failed to follow');
    } finally {
      setActionLoading(false);
    }
  }, [user.id, currentUser?.id, isOwnProfile]);

  // Handle unfollow action (social unfollow - does NOT affect holder count or share price)
  const handleUnfollow = useCallback(async () => {
    if (!user.id || !currentUser?.id) return;

    setActionLoading(true);
    setFollowError(null);
    try {
      const response = await apiService.unfollowUser(user.id, currentUser.id);
      if (response.success) {
        setIsFollowing(false);
      } else {
        setFollowError(response.error || 'Failed to unfollow');
        console.error('Unfollow failed:', response.error);
      }
    } catch (err) {
      console.error('Unfollow failed:', err);
      setFollowError('Failed to unfollow');
    } finally {
      setActionLoading(false);
    }
  }, [user.id, currentUser?.id]);

  const handleCommentCountChange = (postId: string, count: number) => {
    setPosts((prev) =>
      prev.map((post) => (post.id === postId ? { ...post, comments_count: count } : post))
    );
  };

  // Handle opening the buy share dialog
  const handleBuyShareClick = useCallback(() => {
    if (!currentAccount) {
      setFollowError('Please connect your wallet to buy shares');
      return;
    }
    if (isHolder) {
      setFollowError('You already hold a share in this market');
      return;
    }
    if (holdersCount >= MAX_SUPPLY) {
      setFollowError(`Market is sold out (max ${MAX_SUPPLY} holders)`);
      return;
    }
    if (shareLoading) {
      setFollowError('Loading market info, please wait...');
      return;
    }
    if (!marketInfo) {
      setFollowError('Market not found. The user may not have created a market yet.');
      return;
    }
    setFollowError(null);
    setPurchaseError(null);
    setBuyDialogOpen(true);
  }, [currentAccount, marketInfo, holdersCount, shareLoading, isHolder]);

  // Handle actual share purchase via smart contract
  const handleConfirmPurchase = useCallback(async () => {
    if (!marketInfo || isPurchasing) return;

    setIsPurchasing(true);
    setPurchaseError(null);

    try {
      const result = await buyShare(marketInfo.objectId, holdersCount, marketInfo.packageId);

      if (result.success) {
        setIsHolder(true);
        const newHolders = holdersCount + 1;
        setMarketInfo(prev => prev ? { ...prev, holders: prev.holders + 1 } : null);
        showSuccessReceipt({
          targetUsername: user.username,
          targetAvatarUrl: fullProfile?.avatar_url,
          paidPriceSui: formatMistToSui(calculatePriceMist(holdersCount + 1)),
          txDigest: result.txDigest,
          holdersAfterPurchase: newHolders,
          hitGraduationThreshold: newHolders >= GRADUATION_THRESHOLD && holdersCount < GRADUATION_THRESHOLD,
          source: 'user-profile',
        });
        requestAnimationFrame(() => {
          setBuyDialogOpen(false);
        });
      } else {
        const errorMsg = result.error || 'Transaction failed';
        setPurchaseError(errorMsg);
        showError(errorMsg);
      }
    } catch (err: unknown) {
      console.error('Purchase failed:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to purchase share';
      setPurchaseError(errorMsg);
      showError(errorMsg);
    } finally {
      setIsPurchasing(false);
    }
  }, [marketInfo, isPurchasing, buyShare, holdersCount, user.username, fullProfile?.avatar_url, showError, showSuccessReceipt]);

  // Fetch full profile data
  useEffect(() => {
    let isMounted = true;
    const fetchFullProfile = async () => {
      try {
        const response = await apiService.getUser(user.id);
        if (!isMounted) return;
        if (response.success && response.data) {
          setFullProfile(response.data);
        }
      } catch (error) {
        if (!isMounted) return;
        console.error('Failed to fetch full profile:', error);
      }
    };

    fetchFullProfile();
    return () => {
      isMounted = false;
    };
  }, [user.id]);

  // Fetch user posts
  useEffect(() => {
    let isMounted = true;
    const fetchUserPosts = async () => {
      try {
        setLoadingPosts(true);
        setPostsError(null);
        const response = await apiService.getUserPosts(user.id, 50, 0);
        if (!isMounted) return;
        if (response.success && response.data) {
          setPosts(response.data);
        } else {
          setPostsError(response.error || 'Failed to load posts');
        }
      } catch (error) {
        if (!isMounted) return;
        console.error('Failed to fetch user posts:', error);
        setPostsError('Failed to load posts');
      } finally {
        if (isMounted) setLoadingPosts(false);
      }
    };

    fetchUserPosts();
    return () => {
      isMounted = false;
    };
  }, [user.id]);

  return (
    <div className="space-y-6">
      <Card className="border border-gray-200 bg-white p-6">
        <div className="flex items-start gap-4">
          <Avatar className="h-16 w-16">
            {user.avatar_url ? (
              <AvatarImage src={user.avatar_url} alt={displayName} />
            ) : (
              <AvatarFallback className="bg-gray-200 text-lg font-semibold text-gray-700">
                {avatarFallback}
              </AvatarFallback>
            )}
          </Avatar>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-gray-900">{displayName}</h1>
            {fullProfile?.wallet_address && (
              <p className="mt-1 font-mono text-xs text-gray-400 tracking-wide">
                {fullProfile.wallet_address.slice(0, 6)}
                <span className="mx-0.5 text-gray-300">···</span>
                {fullProfile.wallet_address.slice(-4)}
              </p>
            )}
          </div>
        </div>

        {/* Bio */}
        {fullProfile?.bio && (
          <p className="mt-4 text-sm text-gray-600 leading-relaxed">
            {fullProfile.bio}
          </p>
        )}

        {/* Stats */}
        <div className="mt-4 flex items-center gap-6 text-sm">
          <div>
            <span className="font-semibold text-gray-900">{holdersCount}</span>
            <span className="ml-1 text-gray-500">{isGraduated ? 'token holders' : 'holders'}</span>
          </div>
          <div>
            <span className="font-semibold text-cyan-600">{sharePrice}</span>
            <span className="ml-1 text-gray-500">/ {isGraduated ? 'token' : 'share'}</span>
          </div>
          <div>
            <span className="font-semibold text-gray-900">{posts.length}</span>
            <span className="ml-1 text-gray-500">posts</span>
          </div>
        </div>

        {/* Single token symbol entry point */}
        {isGraduated && (
          <div className="mt-3">
            {canTradeToken ? (
              <button
                onClick={handleOpenTrade}
                className="inline-flex items-center rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700 transition-colors hover:bg-cyan-100"
              >
                ${activeTokenSymbol}
              </button>
            ) : (
              <span className="inline-flex items-center rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700">
                ${activeTokenSymbol}
              </span>
            )}
          </div>
        )}

        {/* Graduation progress */}
        {!isGraduated && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>Token graduation</span>
              <span>{holdersCount}/{GRADUATION_THRESHOLD}</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-500"
                style={{ width: `${graduationProgressPercent(holdersCount)}%` }}
              />
            </div>
            {phase === 'graduating' && (
              <div className="mt-2 flex items-center gap-2 rounded-md bg-purple-50 border border-purple-200 px-3 py-2">
                <Rocket className="w-3.5 h-3.5 text-purple-600 flex-shrink-0" />
                <span className="text-xs text-purple-700">
                  Graduation threshold reached — awaiting token launch.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons - only show for non-own profile when logged in */}
        {!isOwnProfile && currentUser && (
          <div className="mt-4 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <button
                onClick={isFollowing ? handleUnfollow : handleFollow}
                disabled={actionLoading}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors disabled:opacity-50 ${
                  isFollowing
                    ? 'border border-gray-200 text-gray-600 hover:bg-red-50 hover:border-red-300 hover:text-red-600'
                    : 'bg-gray-900 text-white hover:bg-gray-800'
                }`}
              >
                {actionLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : isFollowing ? (
                  <>
                    <UserMinus className="w-3 h-3" />
                    Following
                  </>
                ) : (
                  <>
                    <UserPlus className="w-3 h-3" />
                    Follow
                  </>
                )}
              </button>
              {canBuyShare && (
                <button
                  onClick={handleBuyShareClick}
                  disabled={actionLoading || isPurchasing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 transition-colors disabled:opacity-50"
                >
                  {shareLoading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <>
                      <ShoppingCart className="w-3 h-3" />
                      Buy Share ({sharePrice} SUI)
                    </>
                  )}
                </button>
              )}
            </div>
            {followError && (
              <p className="text-xs text-red-500">{followError}</p>
            )}
          </div>
        )}

      </Card>

      <div className="max-w-3xl mx-auto bg-white">
        {loadingPosts ? (
          <div className="p-6 text-sm text-gray-500 text-center">Loading posts...</div>
        ) : postsError ? (
          <div className="p-6 text-sm text-red-500 text-center">{postsError}</div>
        ) : posts.length === 0 ? (
          <div className="p-6 text-sm text-gray-500 text-center">
            Posts from @{user.username} will appear here once published.
          </div>
        ) : (
          posts.map((post) => {
            const mediaUrls = Array.isArray(post.media_urls) ? post.media_urls : [];
            const feedPost: FeedPostItem = {
              id: post.id,
              author: {
                id: post.author_id,
                username: post.author.username,
                // Phase 1: username is the single display identifier
                avatarUrl: post.author.avatar_url,
                bio: post.author.bio,
                tokenSymbol: post.author.token_symbol,
                walletAddress: post.author.wallet_address,
                followersCount: post.author.followers_count,
                holdersCount: post.author.followers_count,
              },
              content: post.content,
              timestamp: formatTimeAgo(post.created_at),
              likesCount: post.likes_count || 0,
              commentsCount: post.comments_count || 0,
              media: mediaUrls.map((url) => ({ type: inferMediaType(url), url })),
            };

            return (
              <FeedPostCard
                key={post.id}
                post={feedPost}
                tone="light"
                currentUserId={currentUser?.id}
                currentUsername={currentUser?.username}
                currentAvatarUrl={currentUser?.avatar_url}
                onCommentCountChange={handleCommentCountChange}
              />
            );
          })
        )}
      </div>

      {/* Buy Share Confirmation Dialog */}
      <BuyShareDialog
        open={buyDialogOpen}
        onOpenChange={(open) => {
          setBuyDialogOpen(open);
          if (!open) {
            setPurchaseError(null);
          }
        }}
        targetUsername={user.username}
        targetAvatarUrl={fullProfile?.avatar_url}
        currentHolders={holdersCount}
        onConfirm={handleConfirmPurchase}
        isPurchasing={isPurchasing}
        error={purchaseError}
        graduationState={graduationState ?? undefined}
      />
    </div>
  );
};
