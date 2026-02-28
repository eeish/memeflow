import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '../ui-simple/Avatar';
import type { FeedAuthor, FeedTone } from './types';
import { HoverProfileCard } from './HoverProfileCard';
import type { TradePageContext } from '../../types/trade';

interface FeedAvatarProps {
  author: FeedAuthor;
  tone?: FeedTone;
  className?: string;
  fallbackClassName?: string;
  holdersCount?: number;
  onBuyClick?: (author: FeedAuthor) => void;
  onClick?: () => void;
  onOpenTrade?: (market: TradePageContext) => void;
}

const HOVER_DELAY = 100; // ms delay before closing to allow mouse to move to card

export const FeedAvatar: React.FC<FeedAvatarProps> = ({
  author,
  tone = 'light',
  className = '',
  fallbackClassName = '',
  holdersCount,
  onBuyClick,
  onClick,
  onOpenTrade,
}) => {
  const [imageError, setImageError] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [anchorEl, setAnchorEl] = useState<HTMLDivElement | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fallbackChar = useMemo(() => {
    const char = author.username?.charAt(0) || '?';
    return char.toUpperCase();
  }, [author.username]);

  const mergedAuthor = useMemo(
    () => ({
      ...author,
      holdersCount: holdersCount ?? author.holdersCount,
    }),
    [author, holdersCount]
  );

  // Use callback ref to get the DOM element
  const setRef = useCallback((node: HTMLDivElement | null) => {
    setAnchorEl(node);
  }, []);

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  const handleMouseEnter = useCallback(() => {
    // Clear any pending close timeout
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setIsHovering(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    // Delay closing to allow mouse to move to the card
    closeTimeoutRef.current = setTimeout(() => {
      setIsHovering(false);
    }, HOVER_DELAY);
  }, []);

  // Called when mouse enters the hover card
  const handleCardMouseEnter = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  // Called when mouse leaves the hover card
  const handleCardMouseLeave = useCallback(() => {
    closeTimeoutRef.current = setTimeout(() => {
      setIsHovering(false);
    }, HOVER_DELAY);
  }, []);

  const handleClick = useCallback(() => {
    if (onClick) {
      onClick();
    }
  }, [onClick]);

  return (
    <div
      ref={setRef}
      className="relative inline-flex self-start cursor-pointer leading-none"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      <Avatar className={className}>
        {author.avatarUrl && !imageError ? (
          <AvatarImage src={author.avatarUrl} alt={author.username} onError={() => setImageError(true)} />
        ) : (
          <AvatarFallback className={fallbackClassName}>{fallbackChar}</AvatarFallback>
        )}
      </Avatar>
      <HoverProfileCard
        author={mergedAuthor}
        isOpen={isHovering}
        tone={tone}
        holdersCountOverride={holdersCount}
        anchorEl={anchorEl}
        onMouseEnter={handleCardMouseEnter}
        onMouseLeave={handleCardMouseLeave}
        onBuyClick={onBuyClick}
        onOpenTrade={onOpenTrade}
      />
    </div>
  );
};
