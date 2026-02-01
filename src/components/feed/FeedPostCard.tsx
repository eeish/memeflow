import React, { useMemo, useState } from 'react';
import { Heart, MessageCircle } from '../ui-simple/Icons';
import type { FeedPostItem, FeedTone } from './types';
import { FeedAvatar } from './FeedAvatar';

interface FeedPostCardProps {
  post: FeedPostItem;
  tone?: FeedTone;
  headerAction?: React.ReactNode;
  bodyExtra?: React.ReactNode;
  onLike?: () => void;
  onComment?: () => void;
  onAuthorClick?: (author: FeedPostItem['author']) => void;
  isLiked?: boolean;
  showActions?: boolean;
  className?: string;
}

export const FeedPostCard: React.FC<FeedPostCardProps> = ({
  post,
  tone = 'light',
  headerAction,
  bodyExtra,
  onLike,
  onComment,
  onAuthorClick,
  isLiked = false,
  showActions = true,
  className = '',
}) => {
  const [forceVideo, setForceVideo] = useState(false);

  const containerClass =
    tone === 'dark'
      ? `glass rounded-lg border border-white/10 p-6 hover:border-white/20 transition-all duration-300 ${className}`
      : `bg-white border-b border-gray-100 py-4 px-4 ${className}`;

  const nameClass = tone === 'dark' ? 'text-white' : 'text-gray-900';
  const secondaryTextClass = tone === 'dark' ? 'text-white/50' : 'text-gray-500';
  const contentClass = tone === 'dark' ? 'text-white/90' : 'text-gray-800';

  const avatarClass =
    tone === 'dark'
      ? 'w-12 h-12 bg-gradient-to-r from-cyan-400 to-purple-400 flex items-center justify-center'
      : 'h-8 w-8 bg-gradient-to-br from-gray-300 to-gray-400';

  const avatarFallbackClass =
    tone === 'dark'
      ? 'bg-transparent text-white font-bold'
      : 'bg-transparent text-xs font-semibold text-gray-800';

  const actionsClass =
    tone === 'dark'
      ? 'flex items-center justify-end gap-2 text-white/60'
      : 'flex items-center justify-end gap-5 text-gray-500';

  const likeButtonClass =
    tone === 'dark'
      ? `hover:bg-pink-500/20 hover:text-pink-400 rounded-md px-2 py-1 ${isLiked ? 'text-pink-400' : ''}`
      : `hover:text-gray-900 transition-colors ${isLiked ? 'text-red-500' : ''}`;

  const commentButtonClass =
    tone === 'dark'
      ? 'hover:bg-cyan-500/20 hover:text-cyan-400 rounded-md px-2 py-1'
      : 'hover:text-gray-900 transition-colors';

  const primaryMedia = post.media && post.media.length > 0 ? post.media[0] : null;
  const renderAsVideo = forceVideo || primaryMedia?.type === 'video';

  const authorHandle = useMemo(() => `@${post.author.username}`, [post.author.username]);

  return (
    <article className={containerClass}>
      <div className="flex space-x-4">
        <div
          onClick={() => onAuthorClick?.(post.author)}
          className={onAuthorClick ? 'cursor-pointer' : ''}
        >
          <FeedAvatar
            author={post.author}
            tone={tone}
            className={avatarClass}
            fallbackClassName={avatarFallbackClass}
            onClick={onAuthorClick ? () => onAuthorClick(post.author) : undefined}
          />
        </div>
        <div className="flex-1">
          <div className="flex items-start justify-between mb-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  onClick={() => onAuthorClick?.(post.author)}
                  className={`font-semibold ${nameClass} truncate ${onAuthorClick ? 'cursor-pointer hover:underline' : ''}`}
                >
                  {post.author.displayName || authorHandle}
                </span>
                {post.author.displayName &&
                  post.author.displayName.toLowerCase() !== post.author.username.toLowerCase() && (
                  <span
                    onClick={() => onAuthorClick?.(post.author)}
                    className={`${secondaryTextClass} text-sm truncate ${onAuthorClick ? 'cursor-pointer hover:underline' : ''}`}
                  >
                    {authorHandle}
                  </span>
                )}
                <span className={`${secondaryTextClass} text-sm`}>·</span>
                <span className={`${secondaryTextClass} text-sm`}>{post.timestamp}</span>
              </div>
            </div>
            {headerAction}
          </div>

          <p className={`${contentClass} mb-4 leading-relaxed whitespace-pre-wrap`}>{post.content}</p>

          {primaryMedia && (
            <div className="mb-3">
              {renderAsVideo ? (
                <video
                  src={primaryMedia.url}
                  controls
                  className={tone === 'dark' ? 'w-full rounded border border-white/10 max-h-96' : 'w-full rounded border border-gray-200 max-h-96'}
                />
              ) : (
                <img
                  src={primaryMedia.url}
                  alt="Post attachment"
                  className={tone === 'dark' ? 'w-full rounded border border-white/10 max-h-96 object-cover' : 'w-full rounded border border-gray-200 max-h-96 object-cover'}
                  onError={() => setForceVideo(true)}
                />
              )}
            </div>
          )}

          {bodyExtra}

          {showActions && (
            <div className={actionsClass}>
              <button onClick={onLike} className={`flex items-center gap-1.5 ${likeButtonClass}`}>
                <Heart className={`h-4 w-4 ${isLiked ? 'fill-current' : ''}`} />
                <span className="text-xs">{post.likesCount ?? 0}</span>
              </button>
              <button onClick={onComment} className={`flex items-center gap-1.5 ${commentButtonClass}`}>
                <MessageCircle className="h-4 w-4" />
                <span className="text-xs">{post.commentsCount ?? 0}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
};
