import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from './ui-simple/Button';
import { TrendingUp, TrendingDown, ArrowLeft, LogOut, Heart, MessageCircle, MoreHorizontal, Trash2, ShoppingCart, Loader2, Rocket } from './ui-simple/Icons';
import { useAuth } from './AuthProvider';
import { useShareMarket, calculatePriceMist, formatMistToSui } from '../hooks/useShareMarket';
import { useGraduation } from '../hooks/useGraduation';
import { useNotifications } from '../contexts/NotificationContext';
import { useSharePurchaseFeedback } from '../contexts/SharePurchaseFeedbackContext';
import { useActiveAddress } from '../hooks/useActiveAddress';
import { apiService, type PostWithAuthor, type User } from '../lib/api';
import type { TradePageContext } from '../types/trade';
import { DeletePostDialog } from './DeletePostDialog';
import { BuyShareDialog } from './BuyShareDialog';
import { GraduationDialog } from './GraduationDialog';
import { GRADUATION_THRESHOLD, MAX_SUPPLY, TERM2_DENOM_BASE, graduationProgressPercent } from '../lib/graduation';

interface ProfileProps {
  user: User;
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
  const { error: showError } = useNotifications();
  const { showSuccessReceipt } = useSharePurchaseFeedback();
  const activeAddress = useActiveAddress();

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
  const [marketInfo, setMarketInfo] = useState<{ objectId: string; holders: number; graduated: boolean; packageId: string } | null>(null);
  const [isHolder, setIsHolder] = useState(false);

  // Graduation state
  const { graduationState, triggerGraduation, isLoading: graduationLoading } = useGraduation(user.wallet_address);
  const [graduationDialogOpen, setGraduationDialogOpen] = useState(false);
  const phase = graduationState?.phase ?? 'shares';
  const isGraduated = marketInfo?.graduated || phase === 'graduated';

  // Determine if viewing own profile or another user's
  const isOwnProfile = !!activeAddress && !!user.wallet_address &&
    activeAddress.toLowerCase() === user.wallet_address.toLowerCase();

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
  const launchInProgress = graduationState?.launchStatus === 'queued' || graduationState?.launchStatus === 'running';
  const launchFailed = graduationState?.launchStatus === 'failed';
  const isAwaitingTokenLaunch = !isGraduated && phase === 'graduating';
  const canLaunchToken = isOwnProfile && !launchInProgress && (isAwaitingTokenLaunch || launchFailed);
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
    const walletAddress = user.wallet_address;
    if (!walletAddress) return;

    let isMounted = true;
    const fetchMarketInfo = async () => {
      try {
        const market = await findMarketByOwner(walletAddress);
        if (!isMounted) return;
        if (market) {
          setMarketInfo({ objectId: market.objectId, holders: market.holders, graduated: market.graduated, packageId: market.packageId });
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
  }, [user.wallet_address, findMarketByOwner, checkHolderStatus, graduationState?.launchStatus]);

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
    if (!activeAddress) {
      showError('Please sign in to buy shares');
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
  }, [activeAddress, marketInfo, holderCount, showError, isHolder]);

  const handleConfirmPurchase = useCallback(async () => {
    if (!marketInfo || isPurchasing) {
      setPurchaseError('Market not found');
      return;
    }

    setIsPurchasing(true);
    setPurchaseError(null);

    try {
      const result = await buyShare(marketInfo.objectId, holderCount, marketInfo.packageId);

      if (result.success) {
        setIsHolder(true);
        const newHolders = holderCount + 1;
        setMarketInfo(prev => prev ? { ...prev, holders: prev.holders + 1 } : null);
        showSuccessReceipt({
          targetUsername: user.username,
          targetAvatarUrl: user.avatar_url,
          paidPriceSui: formatMistToSui(calculatePriceMist(holderCount + 1)),
          txDigest: result.txDigest,
          holdersAfterPurchase: newHolders,
          hitGraduationThreshold: newHolders >= GRADUATION_THRESHOLD && holderCount < GRADUATION_THRESHOLD,
          source: 'profile',
        });
        requestAnimationFrame(() => {
          setBuyShareDialogOpen(false);
        });
      } else {
        const errorMsg = result.error || 'Transaction failed';
        setPurchaseError(errorMsg);
        showError(errorMsg);
      }
    } catch (err: unknown) {
      console.error('Failed to purchase share:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to purchase share';
      setPurchaseError(errorMessage);
      showError(errorMessage);
    } finally {
      setIsPurchasing(false);
    }
  }, [marketInfo, isPurchasing, buyShare, holderCount, user.username, user.avatar_url, showError, showSuccessReceipt]);

  const postCount = posts.length || user.posts_count || 0;

  // Calculate current share price for display
  const currentSharePrice = useMemo(() => {
    const nextHolder = holderCount + 1;
    if (nextHolder > MAX_SUPPLY) return null;
    const mist = calculatePriceMist(nextHolder);
    return formatMistToSui(mist);
  }, [holderCount]);

  return (
    <div className="min-h-screen bg-white">
      {/* Header — no title, just navigation controls */}
      <header className="bg-white sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Back to feed"
          >
            <ArrowLeft className="h-5 w-5 text-gray-500" />
          </button>
          <button
            onClick={signOut}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Sign out"
          >
            <LogOut className="h-5 w-5 text-gray-500" />
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto">
        {/* Profile section — full bleed, no card border */}
        <div className="px-6 pt-2 pb-6 border-b border-gray-100">
          {/* Top row: avatar + identity + price */}
          <div className="flex items-start gap-5">
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt="Avatar"
                className="w-20 h-20 rounded-full object-cover flex-shrink-0 ring-2 ring-offset-2 ring-gray-100"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 flex-shrink-0 ring-2 ring-offset-2 ring-gray-100" />
            )}

            <div className="flex-1 min-w-0 pt-1">
              <h2 className="text-xl font-semibold text-gray-900 tracking-tight">@{user.username}</h2>
              <p className="font-mono text-xs text-gray-400 mt-0.5">{shortAddress}</p>
            </div>

            {/* Price + sparkline */}
            <div className="flex flex-col items-end pt-1 gap-1">
              <MiniChart data={chartData} />
              <div className="font-mono text-sm font-medium text-gray-900">
                {buyPrice.toFixed(4)}{' '}
                <span className="text-xs font-normal text-gray-400">
                  {graduationLoading ? '' : isGraduated ? `$${activeTokenSymbol}` : 'SUI'}
                </span>
              </div>
              <div className={`flex items-center gap-0.5 text-xs ${priceChange >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {priceChange >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="mt-5 flex items-center gap-6">
            <div>
              <span className="text-base font-semibold text-gray-900">{postCount}</span>
              <span className="text-xs text-gray-400 ml-1.5">posts</span>
            </div>
            <div>
              <span className="text-base font-semibold text-gray-900">{formatCount(holderCount)}</span>
              <span className="text-xs text-gray-400 ml-1.5">{graduationLoading ? 'holders' : isGraduated ? 'token holders' : 'holders'}</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="mt-4 flex items-center gap-2">
            {!graduationLoading && canTradeToken && (
              <Button
                size="sm"
                onClick={() =>
                  onOpenTrade({
                    tokenSymbol: activeTokenSymbol,
                    username: user.username,
                    creatorAddress: user.wallet_address,
                    tokenType: graduationState?.tokenType,
                    poolId: graduationState?.poolId,
                    source: 'profile',
                  })
                }
                className="bg-cyan-600 hover:bg-cyan-700 text-white text-xs px-4"
              >
                Trade ${activeTokenSymbol}
              </Button>
            )}
            {!graduationLoading && !isOwnProfile && activeAddress && !!marketInfo && !isGraduated && !isHolder && holderCount < MAX_SUPPLY && (
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
                  <span className="ml-1 opacity-75">({currentSharePrice} SUI)</span>
                )}
              </Button>
            )}
            {!graduationLoading && canLaunchToken && (
              <Button
                size="sm"
                onClick={() => setGraduationDialogOpen(true)}
                className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white text-xs px-4"
              >
                <Rocket className="w-3 h-3 mr-1" />
                {launchFailed ? 'Retry Launch' : 'Launch Token'}
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

          {/* Graduation progress / badge */}
          <div className="mt-5">
            {!graduationLoading && (isGraduated ? (
              <>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-600 border border-purple-100">
                  Graduated &middot; ${activeTokenSymbol}
                </span>
                {graduationState && !graduationState.initialLiquiditySeeded && (
                  <div className="mt-2 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
                    <Rocket className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                    <span className="text-xs text-amber-700">
                      {launchInProgress
                        ? 'Cord is finishing the Phase 2 launch from the operator wallet.'
                        : launchFailed
                          ? graduationState.launchError || 'Phase 2 launch failed. Retry from your wallet once to re-authorize the operator.'
                          : 'Token launch is complete, but the backend has not finished the remaining Phase 2 setup yet.'}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
                  <span>Token graduation</span>
                  <span>{holderCount}/{MAX_SUPPLY}</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-500"
                    style={{ width: `${graduationProgressPercent(holderCount)}%` }}
                  />
                </div>
                {isAwaitingTokenLaunch && (
                  <div className="mt-2 flex items-center justify-between rounded-lg bg-purple-50 border border-purple-100 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Rocket className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
                      <span className="text-xs text-purple-600">
                        {launchInProgress
                          ? `Cord is launching ${activeTokenSymbol ? `$${activeTokenSymbol}` : 'the token'} for Phase 2.`
                          : isOwnProfile
                            ? 'Graduation threshold reached — authorize launch once and Cord will finish the rest.'
                            : 'Graduation threshold reached — awaiting backend token launch.'}
                      </span>
                    </div>
                    {isOwnProfile && (
                      <button
                        onClick={() => setGraduationDialogOpen(true)}
                        className="ml-3 flex-shrink-0 text-xs font-medium text-purple-600 hover:text-purple-800 underline underline-offset-2"
                      >
                        {launchFailed ? 'Retry Launch' : 'Launch Token'}
                      </button>
                    )}
                  </div>
                )}
                {launchFailed && (
                  <div className="mt-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
                    {graduationState?.launchError || 'Token launch failed.'}
                  </div>
                )}
              </>
            ))}
          </div>
        </div>

        {/* Posts — no section header, no card wrapper */}
        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">Loading...</div>
        ) : error ? (
          <div className="py-16 text-center text-sm text-red-400">{error}</div>
        ) : (
          <div>
            {posts.map((post) => (
              <article
                key={post.id}
                className={`border-b border-gray-100 px-6 py-5 transition-opacity duration-300 ${
                  fadingOutPostId === post.id ? 'opacity-0' : 'opacity-100'
                }`}
              >
                {/* Content first — no redundant avatar/username */}
                <p className="text-gray-800 leading-relaxed whitespace-pre-wrap break-words mb-4">
                  {post.content}
                </p>

                {post.media_urls && post.media_urls.length > 0 && (
                  <div className="mb-4">
                    <img
                      src={post.media_urls[0]}
                      alt="Post media"
                      className="w-full rounded-lg border border-gray-100 max-h-96 object-cover"
                    />
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">
                    {formatRelativeTime(new Date(post.created_at).getTime())}
                  </span>
                  <div className="flex items-center gap-4 text-gray-400">
                    <button className="flex items-center gap-1.5 hover:text-gray-700 transition-colors">
                      <Heart className="h-4 w-4" />
                      <span className="text-xs">{post.likes_count || 0}</span>
                    </button>
                    <button className="flex items-center gap-1.5 hover:text-gray-700 transition-colors">
                      <MessageCircle className="h-4 w-4" />
                      <span className="text-xs">{post.comments_count || 0}</span>
                    </button>
                    {/* Three-dot menu */}
                    <div className="relative">
                      <button
                        onClick={() => setOpenDropdownId(openDropdownId === post.id ? null : post.id)}
                        className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                        aria-label="Post options"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                      {openDropdownId === post.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setOpenDropdownId(null)} />
                          <div className="absolute right-0 mt-1 w-36 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-20">
                            <button
                              onClick={() => handleDeleteClick(post)}
                              className="w-full px-3 py-2 text-left text-sm text-red-500 hover:bg-red-50 flex items-center gap-2"
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
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
            setPurchaseError(null);
          }
        }}
        targetUsername={user.username}
        targetAvatarUrl={user.avatar_url}
        currentHolders={holderCount}
        onConfirm={handleConfirmPurchase}
        isPurchasing={isPurchasing}
        error={purchaseError}
        graduationState={graduationState ?? undefined}
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
          launchStatus={graduationState.launchStatus}
          launchStep={graduationState.launchStep}
          operatorAddress={graduationState.operatorAddress}
        />
      )}
    </div>
  );
}
