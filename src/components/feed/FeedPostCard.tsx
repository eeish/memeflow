import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Heart, MessageCircle, MoreHorizontal, Trash2, Crown } from '../ui-simple/Icons';
import type { FeedPostItem, FeedTone } from './types';
import { FeedAvatar } from './FeedAvatar';
import { apiService, type CommentWithAuthor } from '../../lib/api';
import type { TradePageContext } from '../../types/trade';
import {
  PrivateComments,
  adaptCommentsFromApi,
  openViewerContext,
  type CommentAuthor,
  type Reply,
} from '../PrivateComments';

interface FeedPostCardProps {
  post: FeedPostItem;
  tone?: FeedTone;
  headerAction?: React.ReactNode;
  bodyExtra?: React.ReactNode;
  onLike?: () => void;
  onComment?: () => void;
  onAuthorClick?: (author: FeedPostItem['author']) => void;
  onOpenTrade?: (market: TradePageContext) => void;
  isLiked?: boolean;
  showActions?: boolean;
  className?: string;
  canDelete?: boolean;
  onDelete?: () => void;
  isFadingOut?: boolean;
  currentUserId?: string;
  currentUsername?: string;
  currentAvatarUrl?: string | null;
  onCommentCountChange?: (postId: string, count: number) => void;
}

export const FeedPostCard: React.FC<FeedPostCardProps> = ({
  post,
  tone = 'light',
  headerAction,
  bodyExtra,
  onLike,
  onComment,
  onAuthorClick,
  onOpenTrade,
  isLiked = false,
  showActions = true,
  className = '',
  canDelete = false,
  onDelete,
  isFadingOut = false,
  currentUserId,
  currentUsername,
  currentAvatarUrl,
  onCommentCountChange,
}) => {
  const [forceVideo, setForceVideo] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [rawComments, setRawComments] = useState<CommentWithAuthor[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentCount, setCommentCount] = useState(post.commentsCount ?? 0);

  const fadingClass = isFadingOut ? 'opacity-0' : 'opacity-100';
  const containerClass =
    tone === 'dark'
      ? `glass rounded-lg border border-white/10 p-6 hover:border-white/20 transition-all duration-300 ${fadingClass} ${className}`
      : `bg-white border-b border-gray-100 py-4 px-4 transition-opacity duration-300 ${fadingClass} ${className}`;

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

  useEffect(() => {
    setCommentCount(post.commentsCount ?? 0);
  }, [post.commentsCount]);

  const loadComments = useCallback(async () => {
    if (commentsLoading) return;
    try {
      setCommentsLoading(true);
      const response = await apiService.getPostComments(post.id);
      if (response.success && response.data) {
        setRawComments(response.data);
      }
    } finally {
      setCommentsLoading(false);
    }
  }, [commentsLoading, post.id]);

  const handleToggleComments = useCallback(() => {
    if (onComment) {
      onComment();
      return;
    }
    const next = !showComments;
    setShowComments(next);
    if (next && rawComments.length === 0) {
      loadComments();
    }
  }, [onComment, showComments, rawComments.length, loadComments]);

  // Adapt raw comments to PrivateComments format
  const { comments: adaptedComments, repliesByCommentId } = useMemo(
    () => adaptCommentsFromApi(rawComments),
    [rawComments]
  );

  const handleLoadReplies = useCallback(
    async (commentId: string): Promise<Reply[]> => {
      return repliesByCommentId.get(commentId) || [];
    },
    [repliesByCommentId]
  );

  const handleSubmitComment = useCallback(
    async (text: string) => {
      if (!currentUserId) return;
      const response = await apiService.createComment(post.id, {
        user_id: currentUserId,
        content: text,
      });
      if (response.success && response.data) {
        setRawComments((prev) => [...prev, response.data!]);
        const nextCount = commentCount + 1;
        setCommentCount(nextCount);
        onCommentCountChange?.(post.id, nextCount);
      }
    },
    [currentUserId, post.id, commentCount, onCommentCountChange]
  );

  const handleSubmitReply = useCallback(
    async (commentId: string, text: string, replyToUserId?: string) => {
      if (!currentUserId) return;
      const response = await apiService.createComment(post.id, {
        user_id: currentUserId,
        content: text,
        parent_comment_id: commentId,
        reply_to_user_id: replyToUserId || null,
      });
      if (response.success && response.data) {
        setRawComments((prev) => [...prev, response.data!]);
        const nextCount = commentCount + 1;
        setCommentCount(nextCount);
        onCommentCountChange?.(post.id, nextCount);
      }
    },
    [currentUserId, post.id, commentCount, onCommentCountChange]
  );

  const currentUser = useMemo(
    () =>
      currentUserId
        ? { id: currentUserId, name: currentUsername || 'You', avatar: currentAvatarUrl || undefined }
        : undefined,
    [currentUserId, currentUsername, currentAvatarUrl]
  );

  const handleCommentAuthorClick = useCallback(
    (author: CommentAuthor) => {
      if (!onAuthorClick) return;
      onAuthorClick({
        id: author.id,
        username: author.name,
        avatarUrl: author.avatar || null,
      });
    },
    [onAuthorClick]
  );

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
            onOpenTrade={onOpenTrade}
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
                  {authorHandle}
                </span>
                {post.author.isGraduated && (
                  <Crown className="w-3 h-3 text-purple-500 flex-shrink-0" />
                )}
                <span className={`${secondaryTextClass} text-sm`}>·</span>
                <span className={`${secondaryTextClass} text-sm`}>{post.timestamp}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {headerAction}
              {canDelete && onDelete && (
                <div className="relative">
                  <button
                    onClick={() => setShowDropdown(!showDropdown)}
                    className={`p-1.5 rounded-full transition-colors ${
                      tone === 'dark' ? 'hover:bg-white/10' : 'hover:bg-gray-100'
                    }`}
                    aria-label="Post options"
                  >
                    <MoreHorizontal className={`h-4 w-4 ${tone === 'dark' ? 'text-white/60' : 'text-gray-500'}`} />
                  </button>
                  {showDropdown && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setShowDropdown(false)}
                      />
                      <div className={`absolute right-0 mt-1 w-36 rounded-lg shadow-lg border py-1 z-20 ${
                        tone === 'dark' ? 'bg-gray-900 border-white/10' : 'bg-white border-gray-200'
                      }`}>
                        <button
                          onClick={() => {
                            setShowDropdown(false);
                            onDelete();
                          }}
                          className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${
                            tone === 'dark' ? 'text-red-400 hover:bg-red-500/10' : 'text-red-600 hover:bg-red-50'
                          }`}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete post
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <p className={`${contentClass} mb-4 leading-relaxed whitespace-pre-wrap`}>{post.content}</p>

          {primaryMedia && (
            <div className="mb-3 flex justify-center">
              {renderAsVideo ? (
                <video
                  src={primaryMedia.url}
                  controls
                  className={tone === 'dark' ? 'w-full max-h-[28rem] rounded border border-white/10' : 'w-full max-h-[28rem] rounded border border-gray-200'}
                />
              ) : (
                <img
                  src={primaryMedia.url}
                  alt="Post attachment"
                  className={tone === 'dark' ? 'w-full h-auto max-h-[28rem] rounded border border-white/10 object-contain' : 'w-full h-auto max-h-[28rem] rounded border border-gray-200 object-contain'}
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
              <button onClick={handleToggleComments} className={`flex items-center gap-1.5 ${commentButtonClass}`}>
                <MessageCircle className="h-4 w-4" />
                <span className="text-xs">{commentCount}</span>
              </button>
            </div>
          )}

          {showComments && (
            <div className="mt-4 border-t border-gray-100 pt-4">
              {commentsLoading ? (
                <p className="text-xs text-gray-400 py-4">Loading comments...</p>
              ) : (
                <PrivateComments
                  comments={adaptedComments}
                  viewerContext={openViewerContext}
                  onLoadReplies={handleLoadReplies}
                  onSubmitComment={handleSubmitComment}
                  onSubmitReply={handleSubmitReply}
                  currentUser={currentUser}
                  onAuthorClick={handleCommentAuthorClick}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
};
