import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from './ui-simple/Button';
import { TrendingUp, TrendingDown, ArrowLeft, LogOut, Heart, MessageCircle, MoreHorizontal, Trash2, ShoppingCart, Loader2, Rocket } from './ui-simple/Icons';
import { useAuth } from './AuthProvider';
import { useShareMarket, calculatePriceMist, formatMistToSui } from '../hooks/useShareMarket';
import { useGraduation } from '../hooks/useGraduation';
import { useNotifications } from '../contexts/NotificationContext';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { apiService, type PostWithAuthor } from '../lib/api';
import type { TradePageContext } from '../types/trade';
import { DeletePostDialog } from './DeletePostDialog';
import { BuyShareDialog } from './BuyShareDialog';
import { GraduationDialog } from './GraduationDialog';
import { GRADUATION_THRESHOLD, MAX_SUPPLY, TERM2_DENOM_BASE, graduationProgressPercent } from '../lib/graduation';

interface ProfileProps {
  user: any;
  onClose: () => void;
  onEditProfile?: () => void;
  onOpenTrade?: (context: TradePageContext) => void;
}

// Format number with k/m suffix
const formatCount = (count: number): string => {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}m`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return count.toString();
};

const calculateSharePriceSui = (x: number): number => {
  return 0.02 + 0.35 / (x + 3) + 1 / (TERM2_DENOM_BASE - x);
};

// Mini sparkline chart component
function MiniChart({ data }: { data: { time: string; value: number }[] }) {
  if (data.length === 0) return null;

  const values = data.map(d => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const width = 80;
  const height = 24;
  const padding = 1;

  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * (width - padding * 2) + padding;
    const y = height - padding - ((d.value - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  const pathData = `M ${points.join(' L ')}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-20 h-6"
      preserveAspectRatio="none"
    >
      <path
        d={pathData}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// Format relative time from timestamp
const formatRelativeTime = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return 'now';
};

export function Profile({ user, onClose, onEditProfile, onOpenTrade }: ProfileProps) {
  const { signOut } = useAuth();
  const { findMarketByOwner, buyShare, checkHolderStatus, loading: shareLoading } = useShareMarket();
  const { success: showSuccess, error: showError } = useNotifications();
  const currentAccount = useCurrentAccount();

  // Posts from backend service
  const [posts, setPosts] = useState<PostWithAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [postToDelete, setPostToDelete] = useState<PostWithAuthor | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [fadingOutPostId, setFadingOutPostId] = useState<string | null>(null);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  // Buy share state
  const [buyShareDialogOpen, setBuyShareDialogOpen] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [purchaseSuccessful, setPurchaseSuccessful] = useState(false);
  const [purchaseTxDigest, setPurchaseTxDigest] = useState<string | undefined>(undefined);
  const [marketInfo, setMarketInfo] = useState<{ objectId: string; holders: number; graduated: boolean } | null>(null);
  const [isHolder, setIsHolder] = useState(false);

  // Graduation state
  const { graduationState, triggerGraduation } = useGraduation(user.wallet_address);
  const [graduationDialogOpen, setGraduationDialogOpen] = useState(false);
  const phase = graduationState?.phase ?? 'shares';
  const isGraduated = marketInfo?.graduated || phase === 'graduated';

  // Determine if viewing own profile or another user's
  const isOwnProfile = currentAccount?.address && user.wallet_address &&
    currentAccount.address.toLowerCase() === user.wallet_address.toLowerCase();

  // Get holder count from market info or user data
  // When market exists, minimum is 1 (creator always holds first share)
  const rawHolderCount = marketInfo?.holders ?? user.followers_count ?? 0;
  // If user has a market, minimum is 1
  const hasMarket = !!marketInfo || user.followers_count !== undefined || user.id;
  const holderCount = hasMarket
    ? Math.max(1, Math.min(MAX_SUPPLY, rawHolderCount))
    : Math.max(0, Math.min(MAX_SUPPLY, rawHolderCount));

  const chartData = useMemo(() => {
    const data = [];
    for (let i = 1; i <= MAX_SUPPLY; i++) {
      data.push({
        time: i.toString(),
        value: calculateSharePriceSui(i),
      });
    }
    return data;
  }, []);

  // holderCount represents current holders (includes creator, so >= 1 for existing market)
  // Show "price to follow" = buy price = price_mist(holders + 1)
  // When holderCount is 0 (no market yet), show price for first share
  const buyPrice = holderCount > 0 ? calculateSharePriceSui(holderCount + 1) : calculateSharePriceSui(1);
  const previousBuyPrice = holderCount > 0 ? calculateSharePriceSui(holderCount) : buyPrice;
  const priceChange = previousBuyPrice ? ((buyPrice - previousBuyPrice) / previousBuyPrice) * 100 : 0;

  // Get wallet address for display
  const walletAddress = user.wallet_address || '';
  const shortAddress = walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : user.username;
  const profileTokenSymbol = (user.token_symbol || user.username || 'TOKEN').replace('$', '').toUpperCase();
  const activeTokenSymbol = (graduationState?.tokenSymbol || profileTokenSymbol).replace('$', '').toUpperCase();
  const isAwaitingTokenLaunch = !isGraduated && phase === 'graduating';
  const canLaunchToken = isOwnProfile && isAwaitingTokenLaunch;
  const canTradeToken = !!onOpenTrade && isGraduated;


  // Fetch posts from backend service
  useEffect(() => {
    const fetchPosts = async () => {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      try {
        setError(null);
        const response = await apiService.getUserPosts(user.id);
        if (response.success && response.data) {
          setPosts(response.data);
        } else {
          setError(response.error || 'Failed to load posts');
        }
      } catch (err) {
        console.error('Failed to fetch posts:', err);
        setError('Failed to load posts');
      } finally {
        setLoading(false);
      }
    };

    fetchPosts();
  }, [user?.id]);

  // Fetch market info and holder status when we have the wallet address
  useEffect(() => {
    if (!user.wallet_address) return;

    let isMounted = true;
    const fetchMarketInfo = async () => {
      try {
        const market = await findMarketByOwner(user.wallet_address);
        if (!isMounted) return;
        if (market) {
          setMarketInfo({ objectId: market.objectId, holders: market.holders, graduated: market.graduated });
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
  }, [user.wallet_address, findMarketByOwner, checkHolderStatus]);

  const handleDeleteClick = (post: PostWithAuthor) => {
    setPostToDelete(post);
    setDeleteError(null);
    setDeleteDialogOpen(true);
    setOpenDropdownId(null);
  };

  const handleConfirmDelete = async () => {
    if (!user?.id || !postToDelete || deletingPostId) {
      return;
    }

    const postId = postToDelete.id;

    try {
      setDeleteError(null);
      setDeletingPostId(postId);
      const response = await apiService.deletePost(postId, user.id);
      if (response.success && response.data) {
        setDeleteDialogOpen(false);
        setFadingOutPostId(postId);
        // Wait for fade animation then remove from list
        setTimeout(() => {
          setPosts(prev => prev.filter(post => post.id !== postId));
          setFadingOutPostId(null);
          showSuccess('Post deleted successfully');
        }, 300);
      } else {
        setDeleteError(response.error || 'Failed to delete post');
        showError(response.error || 'Failed to delete post');
      }
    } catch (err) {
      console.error('Failed to delete post:', err);
      setDeleteError('Failed to delete post');
      showError('Failed to delete post');
    } finally {
      setDeletingPostId(null);
      setPostToDelete(null);
    }
  };

  // Handle buy share - triggers smart contract
  const handleBuyShareClick = useCallback(() => {
    if (!currentAccount) {
      showError('Please connect your wallet to buy shares');
      return;
    }
    if (isHolder) {
      showError('You already hold a share in this market');
      return;
    }
    if (!marketInfo) {
      showError('Market not found for this user');
      return;
    }
    if (holderCount >= MAX_SUPPLY) {
      showError(`Market is sold out (max ${MAX_SUPPLY} holders)`);
      return;
    }
    setPurchaseError(null);
    setBuyShareDialogOpen(true);
  }, [currentAccount, marketInfo, holderCount, showError, isHolder]);

  const handleConfirmPurchase = useCallback(async () => {
    if (!marketInfo || isPurchasing) {
      setPurchaseError('Market not found');
      return;
    }

    setIsPurchasing(true);
    setPurchaseError(null);

    try {
      const result = await buyShare(marketInfo.objectId, holderCount);

      if (result.success) {
        setPurchaseSuccessful(true);
        setPurchaseTxDigest(result.txDigest);
        setIsHolder(true);
        // Update local holder count
        const newHolders = holderCount + 1;
        setMarketInfo(prev => prev ? { ...prev, holders: prev.holders + 1 } : null);
        if (newHolders >= GRADUATION_THRESHOLD && holderCount < GRADUATION_THRESHOLD) {
          showSuccess(`@${user.username} just hit the graduation threshold! Token launch is now available.`);
        } else {
          showSuccess(`Successfully purchased a share of @${user.username}!`);
        }
      } else {
        const errorMsg = result.error || 'Transaction failed';
        setPurchaseError(errorMsg);
        showError(errorMsg);
      }
    } catch (err: any) {
      console.error('Failed to purchase share:', err);
      const errorMessage = err.message || 'Failed to purchase share';
      setPurchaseError(errorMessage);
      showError(errorMessage);
    } finally {
      setIsPurchasing(false);
    }
  }, [marketInfo, isPurchasing, buyShare, holderCount, user.username, showSuccess, showError]);

  const postCount = posts.length || user.posts_count || 0;

  // Calculate current share price for display
  const currentSharePrice = useMemo(() => {
    const nextHolder = holderCount + 1;
    if (nextHolder > MAX_SUPPLY) return null;
    const mist = calculatePriceMist(nextHolder);
    return formatMistToSui(mist);
  }, [holderCount]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Back to feed"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>
          <h1 className="text-lg tracking-tight text-gray-900">Profile</h1>
          <button
            onClick={signOut}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Sign out"
          >
            <LogOut className="h-5 w-5 text-gray-600" />
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {/* Profile Info with integrated price */}
        <div className="bg-white border border-gray-100 p-6 mb-4">
          <div className="flex items-start gap-4">
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt="Avatar"
                className="w-16 h-16 rounded-full object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-cyan-400 flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <h2 className="font-medium text-gray-900 mb-1">@{user.username}</h2>
              <p className="font-mono text-xs text-gray-500">{shortAddress}</p>
            </div>

            {/* Compact price display */}
            <div className="flex flex-col items-end">
              <div className="flex items-center gap-2 mb-1">
                <MiniChart data={chartData} />
              </div>
              <div className="text-right">
                <div className="font-mono text-sm text-gray-900">
                  {buyPrice.toFixed(4)} <span className="text-xs text-gray-500">{isGraduated ? `$${activeTokenSymbol}` : 'SUI'}</span>
                </div>
                <div className={`flex items-center justify-end gap-0.5 text-xs ${priceChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {priceChange >= 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(1)}%
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <div>
                <span className="font-medium text-gray-900">{postCount}</span> posts
              </div>
              <div>
                <span className="font-medium text-gray-900">{formatCount(holderCount)}</span>{' '}
                {isGraduated ? 'token holders' : 'holders'}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canTradeToken && (
                <Button
                  size="sm"
                  onClick={() =>
                    onOpenTrade({
                      tokenSymbol: activeTokenSymbol,
                      username: user.username,
                      creatorAddress: user.wallet_address,
                      source: 'profile',
                    })
                  }
                  className="bg-cyan-600 hover:bg-cyan-700 text-white text-xs px-4"
                >
                  Trade ${activeTokenSymbol}
                </Button>
              )}
              {!isOwnProfile && currentAccount && !!marketInfo && !isGraduated && !isHolder && holderCount < MAX_SUPPLY && (
                <Button
                  size="sm"
                  onClick={handleBuyShareClick}
                  disabled={isPurchasing || holderCount >= MAX_SUPPLY}
                  className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white text-xs px-4"
                >
                  {isPurchasing || shareLoading ? (
                    <Loader2 className="w-3 h-3 animate-spin mr-1" />
                  ) : (
                    <ShoppingCart className="w-3 h-3 mr-1" />
                  )}
                  Buy Share
                  {currentSharePrice && (
                    <span className="ml-1 opacity-80">({currentSharePrice} SUI)</span>
                  )}
                </Button>
              )}
              {canLaunchToken && (
                <Button
                  size="sm"
                  onClick={() => setGraduationDialogOpen(true)}
                  className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white text-xs px-4"
                >
                  <Rocket className="w-3 h-3 mr-1" />
                  Launch Token
                </Button>
              )}
              {isOwnProfile && (
                <Button
                  size="sm"
                  onClick={onEditProfile}
                  className="bg-gray-900 hover:bg-gray-800 text-white text-xs px-4"
                >
                  Edit Profile
                </Button>
              )}
            </div>
          </div>

          {/* Graduation progress / badge */}
          {isGraduated ? (
            <div className="mt-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                Graduated &middot; ${activeTokenSymbol}
              </span>
            </div>
          ) : (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span>Token graduation</span>
                <span>{holderCount}/{MAX_SUPPLY}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-500"
                  style={{ width: `${graduationProgressPercent(holderCount)}%` }}
                />
              </div>
              {isAwaitingTokenLaunch && (
                <div className="mt-2 flex items-center justify-between rounded-md bg-purple-50 border border-purple-200 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Rocket className="w-3.5 h-3.5 text-purple-600 flex-shrink-0" />
                    <span className="text-xs text-purple-700">
                      {isOwnProfile
                        ? 'Graduation threshold reached — launch a token when you\'re ready.'
                        : 'Graduation threshold reached — awaiting token launch.'}
                    </span>
                  </div>
                  {isOwnProfile && (
                    <button
                      onClick={() => setGraduationDialogOpen(true)}
                      className="ml-3 flex-shrink-0 text-xs font-medium text-purple-700 hover:text-purple-900 underline underline-offset-2"
                    >
                      Launch Token
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* User's Posts */}
        <div className="bg-white border border-gray-100">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-medium text-gray-900">Posts</h3>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-500 text-sm">
              Loading posts...
            </div>
          ) : error ? (
            <div className="p-8 text-center text-red-500 text-sm">
              {error}
            </div>
          ) : posts.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">
              No posts yet. Share your first thought!
            </div>
          ) : (
            <div>
              {posts.map((post) => (
                <article
                  key={post.id}
                  className={`bg-white border-b border-gray-100 py-4 px-4 transition-opacity duration-300 ${
                    fadingOutPostId === post.id ? 'opacity-0' : 'opacity-100'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {user.avatar_url ? (
                        <img
                          src={user.avatar_url}
                          alt="Avatar"
                          className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-cyan-400 flex-shrink-0" />
                      )}
                      <span className="text-sm text-gray-600">
                        {user.username}
                      </span>
                      <span className="text-gray-500 text-sm">·</span>
                      <span className="text-gray-500 text-sm">
                        {formatRelativeTime(new Date(post.created_at).getTime())}
                      </span>
                    </div>
                    {/* Three-dot menu */}
                    <div className="relative">
                      <button
                        onClick={() => setOpenDropdownId(openDropdownId === post.id ? null : post.id)}
                        className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"
                        aria-label="Post options"
                      >
                        <MoreHorizontal className="h-4 w-4 text-gray-500" />
                      </button>
                      {openDropdownId === post.id && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setOpenDropdownId(null)}
                          />
                          <div className="absolute right-0 mt-1 w-36 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                            <button
                              onClick={() => handleDeleteClick(post)}
                              className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete post
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <p className="text-gray-800 mb-3 whitespace-pre-wrap break-words">
                    {post.content}
                  </p>

                  {post.media_urls && post.media_urls.length > 0 && (
                    <div className="mb-3">
                      <img
                        src={post.media_urls[0]}
                        alt="Post media"
                        className="w-full rounded border border-gray-200 max-h-96 object-cover"
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-5 text-gray-500">
                    <button className="flex items-center gap-1.5 hover:text-gray-900 transition-colors">
                      <Heart className="h-4 w-4" />
                      <span className="text-xs">{post.likes_count || 0}</span>
                    </button>
                    <button className="flex items-center gap-1.5 hover:text-gray-900 transition-colors">
                      <MessageCircle className="h-4 w-4" />
                      <span className="text-xs">{post.comments_count || 0}</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Delete Confirmation Dialog */}
      <DeletePostDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        postContent={postToDelete?.content || ''}
        onConfirm={handleConfirmDelete}
        isDeleting={!!deletingPostId}
        error={deleteError}
      />

      {/* Buy Share Confirmation Dialog */}
      <BuyShareDialog
        open={buyShareDialogOpen}
        onOpenChange={(open) => {
          setBuyShareDialogOpen(open);
          if (!open) {
            setPurchaseSuccessful(false);
            setPurchaseTxDigest(undefined);
          }
        }}
        targetUsername={user.username}
        targetAvatarUrl={user.avatar_url}
        currentHolders={holderCount}
        onConfirm={handleConfirmPurchase}
        isPurchasing={isPurchasing}
        error={purchaseError}
        graduationState={graduationState ?? undefined}
        purchaseSuccess={purchaseSuccessful}
        txDigest={purchaseTxDigest}
      />

      {/* Graduation Dialog */}
      {graduationState && (
        <GraduationDialog
          open={graduationDialogOpen}
          onOpenChange={setGraduationDialogOpen}
          username={user.username}
          holdersCount={holderCount}
          treasuryMist={graduationState.treasuryBalanceMist}
          onGraduate={triggerGraduation}
        />
      )}
    </div>
  );
}
