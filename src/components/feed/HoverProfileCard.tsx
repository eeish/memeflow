import React, { useEffect, useMemo, useState, useLayoutEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { apiService, type User } from '../../lib/api';
import { calculatePriceMist, formatMistToSui, useSocialFollow } from '../../hooks/useSocialFollow';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { UserPlus, UserMinus, ShoppingCart, Loader2 } from '../ui-simple/Icons';
import type { FeedAuthor, FeedTone } from './types';

interface HoverProfileCardProps {
  author: FeedAuthor;
  isOpen: boolean;
  tone?: FeedTone;
  holdersCountOverride?: number;
  anchorEl: HTMLElement | null;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onBuyClick?: (author: FeedAuthor) => void;
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
}) => {
  const account = useCurrentAccount();
  const { isFollowing: checkIsFollowing, followUser, unfollowUser, userProfile, loading: followLoading } = useSocialFollow();

  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

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

  // Check follow status
  useEffect(() => {
    if (author.id) {
      setIsFollowing(checkIsFollowing(author.id));
    }
  }, [author.id, checkIsFollowing]);

  // Merge author props with fetched profile data
  const displayName = profile?.display_name || author.displayName;
  const username = profile?.username || author.username;
  const avatarUrl = profile?.avatar_url || author.avatarUrl;
  const rawBio = firstNonEmpty(profile?.bio, author.bio);
  const bio = rawBio || null;
  const walletAddress = firstNonEmpty(
    profile?.wallet_address,
    (profile as { walletAddress?: string } | null | undefined)?.walletAddress,
    author.walletAddress,
    (author as { wallet_address?: string }).wallet_address,
    looksLikeSuiAddress(author.id) ? author.id : null
  );

  // Use holdersCount (contract terminology) - fallback to followersCount for compatibility
  const holdersCount =
    holdersCountOverride ??
    author.holdersCount ??
    profile?.followers_count ??
    author.followersCount ??
    0;

  // Calculate next share price (buy price = price for next holder)
  const nextSharePrice = useMemo(() => {
    const mist = calculatePriceMist(holdersCount + 1);
    return formatMistToSui(mist);
  }, [holdersCount]);

  // Check if this is the current user's own profile
  const isOwnProfile = account?.address && walletAddress && account.address === walletAddress;

  // Handle follow action
  const handleFollow = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (!author.id || !userProfile || isOwnProfile) return;

    setActionLoading(true);
    try {
      // For now, we'll use a placeholder market ID - in production this would come from author data
      const targetMarketId = author.id; // This should be the actual market object ID
      await followUser(targetMarketId, author.id, holdersCount);
      setIsFollowing(true);
    } catch (err) {
      console.error('Follow failed:', err);
    } finally {
      setActionLoading(false);
    }
  }, [author.id, userProfile, isOwnProfile, followUser, holdersCount]);

  // Handle unfollow action
  const handleUnfollow = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (!author.id || !userProfile) return;

    setActionLoading(true);
    try {
      const targetMarketId = author.id;
      await unfollowUser(targetMarketId, author.id);
      setIsFollowing(false);
    } catch (err) {
      console.error('Unfollow failed:', err);
    } finally {
      setActionLoading(false);
    }
  }, [author.id, userProfile, unfollowUser]);

  // Handle buy action - trigger callback with author info
  const handleBuy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (onBuyClick) {
      onBuyClick(author);
    }
  }, [onBuyClick, author]);

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

  const shortAddress = shortenAddress(walletAddress);

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

  // Don't render if not open or no position calculated
  if (!isOpen) return null;

  const card = (
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
              alt={displayName || username}
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
            {displayName || username}
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
          <span className={`ml-1 ${mutedTextClass}`}>holders</span>
        </div>
        <div className="text-sm">
          <span className={`font-semibold ${highlightClass}`}>
            {nextSharePrice} SUI
          </span>
          <span className={`ml-1 ${mutedTextClass}`}>/ share</span>
        </div>
      </div>

      {/* Action Buttons */}
      {!isOwnProfile && account && (
        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={isFollowing ? handleUnfollow : handleFollow}
            disabled={actionLoading || followLoading}
            className={`flex-1 flex items-center justify-center gap-1.5 ${followButtonClass}`}
          >
            {actionLoading || followLoading ? (
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
          <button
            onClick={handleBuy}
            className={`flex-1 flex items-center justify-center gap-1.5 ${buyButtonClass}`}
          >
            <ShoppingCart className="w-3 h-3" />
            Buy
          </button>
        </div>
      )}
    </div>
  );

  return createPortal(card, document.body);
};
