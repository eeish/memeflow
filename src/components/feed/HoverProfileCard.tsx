import React, { useEffect, useMemo, useState, useLayoutEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { apiService, type User } from '../../lib/api';
import { useShareMarket, calculatePriceMist, formatMistToSui } from '../../hooks/useShareMarket';
import { useGraduation } from '../../hooks/useGraduation';
import { GRADUATION_THRESHOLD, MAX_SUPPLY, graduationProgressPercent } from '../../lib/graduation';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { useNotifications } from '../../contexts/NotificationContext';
import { useSharePurchaseFeedback } from '../../contexts/SharePurchaseFeedbackContext';
import { UserPlus, UserMinus, ShoppingCart, Loader2 } from '../ui-simple/Icons';
import { BuyShareDialog } from '../BuyShareDialog';
import type { FeedAuthor, FeedTone } from './types';
import type { TradePageContext } from '../../types/trade';

interface HoverProfileCardProps {
  author: FeedAuthor;
  isOpen: boolean;
  tone?: FeedTone;
  holdersCountOverride?: number;
  anchorEl: HTMLElement | null;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onBuyClick?: (author: FeedAuthor) => void;
  onOpenTrade?: (market: TradePageContext) => void;
}

// Shorten wallet address: 0x1234...abcd
function shortenAddress(address: string | undefined): string | null {
  if (!address) return null;
  const trimmed = address.trim();
  if (trimmed.length < 12) return trimmed;
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}

const CARD_GAP = 8;

type MaybeString = string | null | undefined;

function firstNonEmpty(...values: MaybeString[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function looksLikeSuiAddress(value: MaybeString): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.startsWith('0x') && trimmed.length >= 12;
}

function calculatePosition(
  anchorEl: HTMLElement | null,
  cardRect: DOMRect
): { top: number; left: number } | null {
  if (!anchorEl) return null;

  const rect = anchorEl.getBoundingClientRect();

  // Sanity check - if rect is all zeros, element isn't properly rendered
  if (rect.width === 0 && rect.height === 0) return null;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Position below the avatar, with left edge slightly right of its center point.
  let left = rect.left + rect.width / 2 + CARD_GAP;
  let top = rect.bottom + CARD_GAP;

  if (left + cardRect.width > viewportWidth - CARD_GAP) {
    left = viewportWidth - cardRect.width - CARD_GAP;
  }

  if (left < CARD_GAP) {
    left = CARD_GAP;
  }

  if (top + cardRect.height > viewportHeight - CARD_GAP) {
    top = rect.top - cardRect.height - CARD_GAP;
  }

  if (top < CARD_GAP) {
    top = CARD_GAP;
  }

  return { top, left };
}

export const HoverProfileCard: React.FC<HoverProfileCardProps> = ({
  author,
  isOpen,
  tone = 'light',
  holdersCountOverride,
  anchorEl,
  onMouseEnter,
  onMouseLeave,
  onBuyClick,
  onOpenTrade,
}) => {
  const account = useCurrentAccount();
  const { findMarketByOwner, buyShare, checkHolderStatus, loading: shareLoading } = useShareMarket();
  const { error: showError } = useNotifications();
  const { showSuccessReceipt } = useSharePurchaseFeedback();

  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Market info state
  const [marketInfo, setMarketInfo] = useState<{ objectId: string; holders: number; graduated: boolean; packageId: string } | null>(null);
  const [marketInfoLoading, setMarketInfoLoading] = useState(false);
  const [marketInfoFetched, setMarketInfoFetched] = useState(false);

  // Buy share dialog state
  const [buyDialogOpen, setBuyDialogOpen] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [isHolder, setIsHolder] = useState(false);

  // Reset profile when author changes
  useEffect(() => {
    setProfile(null);
  }, [author.id]);

  // Fetch full profile data on hover
  useEffect(() => {
    if (!isOpen || !author.id || profile || loading) return;

    let isMounted = true;
    setLoading(true);
    apiService
      .getUser(author.id)
      .then((response) => {
        if (!isMounted) return;
        if (response.success && response.data) {
          setProfile(response.data);
        }
      })
      .catch((error) => {
        console.warn('Failed to load hover profile:', error);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [author.id, isOpen, loading, profile]);

  // Merge author props with fetched profile data
  const username = profile?.username || author.username;
  const displayName = username;
  const avatarUrl = profile?.avatar_url || author.avatarUrl;
  const tokenSymbol = (firstNonEmpty(profile?.token_symbol, author.tokenSymbol, username)?.replace('$', '').toUpperCase()) || 'TOKEN';
  const rawBio = firstNonEmpty(profile?.bio, author.bio);
  const bio = rawBio || null;
  const walletAddress = firstNonEmpty(
    profile?.wallet_address,
    (profile as { walletAddress?: string } | null | undefined)?.walletAddress,
    author.walletAddress,
    (author as { wallet_address?: string }).wallet_address,
    looksLikeSuiAddress(author.id) ? author.id : null
  );

  // Graduation state
  const { graduationState } = useGraduation(walletAddress);
  const phase = graduationState?.phase ?? 'shares';
  const isGraduated = marketInfo?.graduated || phase === 'graduated';
  const activeTokenSymbol = (graduationState?.tokenSymbol || tokenSymbol).replace('$', '').toUpperCase();
  const canTradeToken = !!onOpenTrade && isGraduated;

  // Reset market info when author changes
  useEffect(() => {
    setMarketInfo(null);
    setMarketInfoFetched(false);
    setIsHolder(false);
  }, [author.id]);

  // Fetch market info when we have the wallet address
  useEffect(() => {
    if (!isOpen || !walletAddress || marketInfoFetched) return;

    let isMounted = true;
    setMarketInfoLoading(true);

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
      } finally {
        if (isMounted) {
          setMarketInfoLoading(false);
          setMarketInfoFetched(true);
        }
      }
    };

    fetchMarketInfo();
    return () => {
      isMounted = false;
    };
  }, [isOpen, walletAddress, findMarketByOwner, checkHolderStatus, marketInfoFetched]);

  // Use holdersCount - prioritize on-chain market data
  // Minimum is 1 when user has a market (creator always holds first share)
  const rawHoldersCount =
    marketInfo?.holders ??
    holdersCountOverride ??
    author.holdersCount ??
    profile?.followers_count ??
    author.followersCount ??
    0;
  // If author has an ID (is a registered user), they have a market, so minimum is 1
  const hasMarket = !!marketInfo || !!author.id || !!profile;
  const holdersCount = hasMarket ? Math.max(1, rawHoldersCount) : rawHoldersCount;

  // Calculate next share price (buy price = price for next holder)
  const nextSharePrice = useMemo(() => {
    const mist = calculatePriceMist(holdersCount + 1);
    return formatMistToSui(mist);
  }, [holdersCount]);

  // Check if this is the current user's own profile
  const isOwnProfile = !!account?.address && !!walletAddress && account.address.toLowerCase() === walletAddress.toLowerCase();

  // Handle follow action (social follow via API - separate from share purchase)
  const handleFollow = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (!author.id || isOwnProfile) return;

    setActionLoading(true);
    try {
      // Social follow via backend API (not on-chain)
      // TODO: Implement API follow when backend supports it
      setIsFollowing(true);
    } catch (err) {
      console.error('Follow failed:', err);
    } finally {
      setActionLoading(false);
    }
  }, [author.id, isOwnProfile]);

  // Handle unfollow action (social unfollow via API)
  const handleUnfollow = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (!author.id) return;

    setActionLoading(true);
    try {
      // Social unfollow via backend API (not on-chain)
      // TODO: Implement API unfollow when backend supports it
      setIsFollowing(false);
    } catch (err) {
      console.error('Unfollow failed:', err);
    } finally {
      setActionLoading(false);
    }
  }, [author.id]);

  // Handle buy action - open dialog for smart contract purchase
  const handleBuy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (!account) {
      showError('Please connect your wallet to buy shares');
      return;
    }

    if (isHolder) {
      showError('You already hold a share in this market');
      return;
    }

    if (holdersCount >= MAX_SUPPLY) {
      showError(`Market is sold out (max ${MAX_SUPPLY} holders)`);
      return;
    }

    if (shareLoading || marketInfoLoading) {
      showError('Loading market info, please wait...');
      return;
    }

    if (!marketInfo) {
      showError('Market not found. The user may not have created a market yet.');
      return;
    }

    setPurchaseError(null);
    setBuyDialogOpen(true);

    // Also call the callback if provided (for external handling)
    if (onBuyClick) {
      onBuyClick(author);
    }
  }, [account, marketInfo, holdersCount, shareLoading, marketInfoLoading, isHolder, onBuyClick, author, showError]);

  // Handle confirm purchase - execute smart contract
  const handleConfirmPurchase = useCallback(async () => {
    if (!marketInfo || isPurchasing) {
      setPurchaseError('Market not found');
      return;
    }

    setIsPurchasing(true);
    setPurchaseError(null);

    try {
      const result = await buyShare(marketInfo.objectId, holdersCount, marketInfo.packageId);

      if (result.success) {
        const newHolders = holdersCount + 1;
        setIsHolder(true);
        setMarketInfo(prev => prev ? { ...prev, holders: prev.holders + 1 } : null);
        setIsFollowing(true);
        showSuccessReceipt({
          targetUsername: author.username,
          targetAvatarUrl: avatarUrl,
          paidPriceSui: formatMistToSui(calculatePriceMist(holdersCount + 1)),
          txDigest: result.txDigest,
          holdersAfterPurchase: newHolders,
          hitGraduationThreshold: newHolders >= GRADUATION_THRESHOLD && holdersCount < GRADUATION_THRESHOLD,
          source: 'hover-card',
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
      console.error('Failed to purchase share:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to purchase share';
      setPurchaseError(errorMessage);
      showError(errorMessage);
    } finally {
      setIsPurchasing(false);
    }
  }, [marketInfo, isPurchasing, buyShare, holdersCount, author.username, avatarUrl, showError, showSuccessReceipt]);

  const handleOpenTrade = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (!onOpenTrade) return;
      onOpenTrade({
        tokenSymbol: activeTokenSymbol,
        username: author.username,
        creatorAddress: walletAddress ?? undefined,
        tokenType: graduationState?.tokenType,
        poolId: graduationState?.poolId,
        source: 'feed',
      });
    },
    [activeTokenSymbol, author.username, onOpenTrade, walletAddress, graduationState?.tokenType, graduationState?.poolId]
  );

  // Styling based on tone
  const containerClass =
    tone === 'dark'
      ? 'bg-gray-900 text-white border border-white/10 shadow-xl'
      : 'bg-white text-gray-900 border border-gray-200 shadow-lg';

  const mutedTextClass = tone === 'dark' ? 'text-white/50' : 'text-gray-500';
  const secondaryTextClass = tone === 'dark' ? 'text-white/70' : 'text-gray-600';
  const highlightClass = tone === 'dark' ? 'text-cyan-400' : 'text-cyan-600';
  const avatarBgClass = tone === 'dark' ? 'bg-cyan-600' : 'bg-cyan-400';

  const buttonBaseClass = tone === 'dark'
    ? 'px-3 py-1.5 text-xs font-medium rounded-md transition-colors'
    : 'px-3 py-1.5 text-xs font-medium rounded-md transition-colors';

  const followButtonClass = isFollowing
    ? tone === 'dark'
      ? `${buttonBaseClass} border border-white/20 text-white/80 hover:bg-white/10 hover:border-red-400 hover:text-red-400`
      : `${buttonBaseClass} border border-gray-300 text-gray-700 hover:bg-red-50 hover:border-red-400 hover:text-red-600`
    : tone === 'dark'
      ? `${buttonBaseClass} bg-cyan-500 text-white hover:bg-cyan-400`
      : `${buttonBaseClass} bg-blue-500 text-white hover:bg-blue-600`;

  const buyButtonClass = tone === 'dark'
    ? `${buttonBaseClass} bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-400 hover:to-pink-400`
    : `${buttonBaseClass} bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600`;

  const shortAddress = shortenAddress(walletAddress ?? undefined);

  // Get avatar fallback character
  const fallbackChar = (username?.charAt(0) || '?').toUpperCase();

  // Calculate position synchronously when opening and when content changes
  useLayoutEffect(() => {
    if (!isOpen || !anchorEl || !cardRef.current) {
      setPosition(null);
      return;
    }

    const cardRect = cardRef.current.getBoundingClientRect();
    const pos = calculatePosition(anchorEl, cardRect);
    setPosition(pos);
  }, [isOpen, anchorEl, displayName, username, bio, holdersCount, nextSharePrice]);

  // Keep the card near the avatar if the viewport or scroll position changes.
  useEffect(() => {
    if (!isOpen) return;

    const handleReposition = () => {
      if (!anchorEl || !cardRef.current) return;
      const cardRect = cardRef.current.getBoundingClientRect();
      setPosition(calculatePosition(anchorEl, cardRect));
    };

    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [isOpen, anchorEl]);

  // Don't render the hover card if not open, BUT keep rendering if dialog is open
  // This prevents the dialog from disappearing when mouse leaves the card
  const shouldRenderCard = isOpen;
  const shouldRenderDialog = buyDialogOpen;

  // If neither card nor dialog should render, return null
  if (!shouldRenderCard && !shouldRenderDialog) return null;

  const card = shouldRenderCard ? (
    <div
      ref={cardRef}
      className={`fixed z-[9999] w-72 rounded-lg p-4 ${containerClass}`}
      style={{
        top: `${position?.top ?? 0}px`,
        left: `${position?.left ?? 0}px`,
        visibility: position ? 'visible' : 'hidden',
      }}
      role="tooltip"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Header: Avatar + Name + Address */}
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="flex-shrink-0">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              className="w-12 h-12 rounded-full object-cover"
            />
          ) : (
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-lg ${avatarBgClass}`}
            >
              {fallbackChar}
            </div>
          )}
        </div>

        {/* Name and Address */}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-base truncate">
            @{displayName}
          </div>
          <div className={`text-sm font-mono ${mutedTextClass} truncate`}>
            {shortAddress || '—'}
          </div>
        </div>
      </div>

      {/* Bio */}
      {bio && (
        <p className={`mt-3 text-sm leading-relaxed ${secondaryTextClass}`}>
          {bio.length > 100 ? `${bio.slice(0, 97)}...` : bio}
        </p>
      )}

      {/* Stats: Holders + Share Price */}
      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm">
          <span className="font-semibold">
            {holdersCount.toLocaleString()}
          </span>
          <span className={`ml-1 ${mutedTextClass}`}>{isGraduated ? 'token holders' : 'holders'}</span>
        </div>
        <div className="text-sm">
          <span className={`font-semibold ${highlightClass}`}>
            {nextSharePrice}
          </span>
          <span className={`ml-1 ${mutedTextClass}`}>/ {isGraduated ? 'token' : 'share'}</span>
        </div>
      </div>

      {/* Token symbol entry point — only shown after graduation threshold is reached */}
      {(isGraduated || phase === 'graduating') && (
        <div className="mt-2 flex items-center justify-between">
          <span className={`text-xs uppercase tracking-wide ${mutedTextClass}`}>Token</span>
          {canTradeToken ? (
            <button
              onClick={handleOpenTrade}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone === 'dark' ? 'bg-white/10 text-cyan-300 hover:bg-white/20' : 'bg-cyan-50 text-cyan-700 hover:bg-cyan-100'}`}
            >
              ${activeTokenSymbol}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone === 'dark' ? 'bg-white/10 text-cyan-300' : 'bg-cyan-50 text-cyan-700'}`}>
                ${activeTokenSymbol}
              </span>
              {phase === 'graduating' && (
                <span className={`text-[10px] font-medium ${tone === 'dark' ? 'text-amber-300' : 'text-amber-700'}`}>
                  Pending launch
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Graduation progress */}
      {!isGraduated && (
        <div className="mt-2">
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
              style={{ width: `${graduationProgressPercent(holdersCount)}%` }}
            />
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {!isOwnProfile && account && (
        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={isFollowing ? handleUnfollow : handleFollow}
            disabled={actionLoading}
            className={`flex-1 flex items-center justify-center gap-1.5 ${followButtonClass}`}
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
          {!!marketInfo && !isGraduated && !isHolder && holdersCount < MAX_SUPPLY && (
            <button
              onClick={handleBuy}
              disabled={isPurchasing || marketInfoLoading}
              className={`flex-1 flex items-center justify-center gap-1.5 ${buyButtonClass} disabled:opacity-50`}
            >
              {shareLoading || marketInfoLoading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <>
                  <ShoppingCart className="w-3 h-3" />
                  Buy
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  ) : null;

  return createPortal(
    <>
      {card}
      {shouldRenderDialog && (
        <BuyShareDialog
          open={buyDialogOpen}
          onOpenChange={(open) => {
            setBuyDialogOpen(open);
            if (!open) {
              setPurchaseError(null);
            }
          }}
          targetUsername={username || ''}
          targetAvatarUrl={avatarUrl}
          currentHolders={holdersCount}
          onConfirm={handleConfirmPurchase}
          isPurchasing={isPurchasing}
          error={purchaseError}
          graduationState={graduationState ?? undefined}
        />
      )}
    </>,
    document.body
  );
};
