import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from './ui-simple/Avatar';
import { Button } from './ui-simple/Button';
import { Textarea } from './ui-simple/Textarea';
import { formatTimeAgo } from '../lib/feed';
import type { CommentWithAuthor } from '../lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CommentAuthor {
  id?: string;
  name: string;
  avatar?: string;
}

export interface Comment {
  id: string;
  author: CommentAuthor;
  time: string;
  text: string;
  replyCount: number;
}

export interface Reply {
  id: string;
  parentCommentId: string;
  author: CommentAuthor;
  time: string;
  text: string;
}

export interface ViewerContext {
  isParticipant: (commentId: string) => boolean;
  canViewReplies: (commentId: string) => boolean;
}

export interface PostHeader {
  author: CommentAuthor;
  time: string;
  text: string;
}

interface PrivateCommentsProps {
  post?: PostHeader;
  comments: Comment[];
  viewerContext: ViewerContext;
  onLoadReplies: (commentId: string) => Promise<Reply[]>;
  onSubmitComment: (text: string) => Promise<void>;
  onSubmitReply: (commentId: string, text: string, replyToUserId?: string) => Promise<void>;
  currentUser?: CommentAuthor;
  onAuthorClick?: (author: CommentAuthor) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Adapter: Convert CommentWithAuthor[] to Comment[] + Reply[]
// ─────────────────────────────────────────────────────────────────────────────

export interface AdaptedComments {
  comments: Comment[];
  repliesByCommentId: Map<string, Reply[]>;
}

export function adaptCommentsFromApi(rawComments: CommentWithAuthor[]): AdaptedComments {
  const repliesByCommentId = new Map<string, Reply[]>();
  const topLevelComments: Comment[] = [];

  // First pass: separate top-level comments from replies
  const topLevel: CommentWithAuthor[] = [];
  const replies: CommentWithAuthor[] = [];

  for (const c of rawComments) {
    if (c.parent_comment_id) {
      replies.push(c);
    } else {
      topLevel.push(c);
    }
  }

  // Build reply map
  for (const r of replies) {
    const parentId = r.parent_comment_id!;
    const existing = repliesByCommentId.get(parentId) || [];
    existing.push({
      id: r.id,
      parentCommentId: parentId,
      author: {
        id: r.author?.id,
        name: r.author?.username || 'user',
        avatar: r.author?.avatar_url,
      },
      time: r.created_at,
      text: r.content,
    });
    repliesByCommentId.set(parentId, existing);
  }

  // Build top-level comments with reply counts
  for (const c of topLevel) {
    const replyCount = repliesByCommentId.get(c.id)?.length || 0;
    topLevelComments.push({
      id: c.id,
      author: {
        id: c.author?.id,
        name: c.author?.username || 'user',
        avatar: c.author?.avatar_url,
      },
      time: c.created_at,
      text: c.content,
      replyCount,
    });
  }

  return { comments: topLevelComments, repliesByCommentId };
}

/** Default open viewer context - all replies visible to all users */
export const openViewerContext: ViewerContext = {
  isParticipant: () => true,
  canViewReplies: () => true,
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function UserAvatar({
  author,
  size = 'md',
  onClick,
}: {
  author: CommentAuthor;
  size?: 'sm' | 'md';
  onClick?: () => void;
}) {
  const sizeClass = size === 'sm' ? 'h-6 w-6' : 'h-9 w-9';
  const textClass = size === 'sm' ? 'text-xs' : 'text-sm';
  const avatarContent = (
    <Avatar className={sizeClass}>
      {author.avatar ? (
        <AvatarImage src={author.avatar} alt={author.name} />
      ) : (
        <AvatarFallback className={`bg-gray-200 text-gray-600 ${textClass}`}>
          {author.name[0]?.toUpperCase() || '?'}
        </AvatarFallback>
      )}
    </Avatar>
  );

  if (!onClick) {
    return avatarContent;
  }

  return (
    <button
      type="button"
      className="rounded-full transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={`View ${author.name}'s profile`}
    >
      {avatarContent}
    </button>
  );
}

function CommentHeader({
  author,
  time,
  onAuthorClick,
}: {
  author: CommentAuthor;
  time: string;
  onAuthorClick?: (author: CommentAuthor) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {onAuthorClick ? (
        <button
          type="button"
          className="text-sm font-medium text-gray-900 hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            onAuthorClick(author);
          }}
        >
          {author.name}
        </button>
      ) : (
        <span className="text-sm font-medium text-gray-900">{author.name}</span>
      )}
      <span className="text-xs text-gray-300">·</span>
      <span className="text-xs text-gray-400">{formatTimeAgo(time)}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reply List (level 2)
// ─────────────────────────────────────────────────────────────────────────────

interface ReplyItemProps {
  reply: Reply;
  parentComment: Comment;
  onReplyToReply: (parentComment: Comment, replyAuthor: CommentAuthor) => void;
  onAuthorClick?: (author: CommentAuthor) => void;
}

function ReplyItem({ reply, parentComment, onReplyToReply, onAuthorClick }: ReplyItemProps) {
  return (
    <div className="flex gap-2">
      <UserAvatar
        author={reply.author}
        size="sm"
        onClick={onAuthorClick ? () => onAuthorClick(reply.author) : undefined}
      />
      <div className="min-w-0 flex-1">
        <CommentHeader author={reply.author} time={reply.time} onAuthorClick={onAuthorClick} />
        <p
          className="mt-1 cursor-pointer text-sm leading-[1.45] text-gray-700 whitespace-pre-wrap break-words"
          onClick={() => onReplyToReply(parentComment, reply.author)}
        >
          {reply.text}
        </p>
      </div>
    </div>
  );
}

interface ReplySectionProps {
  comment: Comment;
  viewerContext: ViewerContext;
  onLoadReplies: (commentId: string) => Promise<Reply[]>;
  onReplyToReply: (parentComment: Comment, replyAuthor: CommentAuthor) => void;
  onAuthorClick?: (author: CommentAuthor) => void;
}

function ReplySection({
  comment,
  viewerContext,
  onLoadReplies,
  onReplyToReply,
  onAuthorClick,
}: ReplySectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(false);

  const canView = viewerContext.canViewReplies(comment.id);
  const isParticipant = viewerContext.isParticipant(comment.id);

  const handleExpand = useCallback(() => {
    if (!canView) return;
    setExpanded(true);
  }, [canView]);

  const handleCollapse = useCallback(() => {
    setExpanded(false);
  }, []);

  useEffect(() => {
    if (!expanded || !canView) return;

    let active = true;
    const syncReplies = async () => {
      setLoading(true);
      try {
        const loadedReplies = await onLoadReplies(comment.id);
        if (active) {
          setReplies(loadedReplies);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void syncReplies();
    return () => {
      active = false;
    };
  }, [expanded, canView, comment.id, comment.replyCount, onLoadReplies]);

  if (comment.replyCount === 0) {
    return null;
  }

  // Non-participants or unauthorized viewers
  if (!canView || !isParticipant) {
    return (
      <div className="mt-1.5 ml-11 pl-3 border-l border-gray-100">
        <span className="text-xs text-gray-400">
          {comment.replyCount === 1 ? '1 reply hidden' : `${comment.replyCount} replies hidden`}
        </span>
      </div>
    );
  }

  // Collapsed state
  if (!expanded) {
    return (
      <div className="mt-1.5 ml-11 pl-3 border-l border-gray-100">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleExpand();
          }}
          className="text-xs text-gray-500 transition-colors hover:text-gray-700 hover:underline"
        >
          View {comment.replyCount} {comment.replyCount === 1 ? 'reply' : 'replies'}
        </button>
      </div>
    );
  }

  // Expanded state
  return (
    <div className="mt-3 ml-11 pl-3 border-l border-gray-100">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleCollapse();
          }}
          className="text-xs text-gray-400 transition-colors hover:text-gray-600"
        >
          Hide replies
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400">Loading replies...</div>
      ) : replies.length === 0 ? (
        <div className="text-sm text-gray-400">No replies yet.</div>
      ) : (
        <div className="space-y-3">
          {replies.map((reply) => (
            <ReplyItem
              key={reply.id}
              reply={reply}
              parentComment={comment}
              onReplyToReply={onReplyToReply}
              onAuthorClick={onAuthorClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Primary Comment (level 1)
// ─────────────────────────────────────────────────────────────────────────────

interface CommentItemProps {
  comment: Comment;
  viewerContext: ViewerContext;
  onLoadReplies: (commentId: string) => Promise<Reply[]>;
  onSelectForReply: (parentComment: Comment, targetAuthor: CommentAuthor) => void;
  onAuthorClick?: (author: CommentAuthor) => void;
  isSelected: boolean;
}

function CommentItem({
  comment,
  viewerContext,
  onLoadReplies,
  onSelectForReply,
  onAuthorClick,
  isSelected,
}: CommentItemProps) {
  return (
    <div className={`py-3.5 rounded-md transition-colors ${isSelected ? 'bg-gray-50' : 'hover:bg-gray-50/60'}`}>
      <div className="flex gap-3">
        <UserAvatar
          author={comment.author}
          onClick={onAuthorClick ? () => onAuthorClick(comment.author) : undefined}
        />
        <div className="min-w-0 flex-1">
          <CommentHeader author={comment.author} time={comment.time} onAuthorClick={onAuthorClick} />
          <p
            className="mt-1 cursor-pointer text-[15px] leading-[1.45] text-gray-800 whitespace-pre-wrap break-words"
            onClick={() => onSelectForReply(comment, comment.author)}
          >
            {comment.text}
          </p>
        </div>
      </div>

      <ReplySection
        comment={comment}
        viewerContext={viewerContext}
        onLoadReplies={onLoadReplies}
        onReplyToReply={onSelectForReply}
        onAuthorClick={onAuthorClick}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Global Composer
// ─────────────────────────────────────────────────────────────────────────────

interface ComposerProps {
  currentUser?: CommentAuthor;
  replyingToAuthor: CommentAuthor | null;
  onCancelReply: () => void;
  onSubmit: (text: string) => Promise<void>;
}

function Composer({ currentUser, replyingToAuthor, onCancelReply, onSubmit }: ComposerProps) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (replyingToAuthor && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [replyingToAuthor]);

  const handleSubmit = useCallback(async () => {
    if (!text.trim() || submitting) return;

    setSubmitting(true);
    try {
      await onSubmit(text.trim());
      setText('');
    } finally {
      setSubmitting(false);
    }
  }, [text, submitting, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const placeholder = replyingToAuthor ? 'Write a reply...' : 'Write a comment...';

  return (
    <div className="mt-3 pt-3">
      {replyingToAuthor && (
        <div className="flex items-center justify-between mb-2 text-sm">
          <span className="text-gray-400">
            Replying to <span className="font-medium text-gray-600">@{replyingToAuthor.name}</span>
          </span>
          <button
            type="button"
            onClick={onCancelReply}
            className="text-gray-400 hover:text-gray-500 transition-colors text-xs"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="flex gap-3 items-start">
        {currentUser && <UserAvatar author={currentUser} />}
        <div className="min-w-0 flex-1">
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={2}
            className="resize-none bg-gray-50 border-gray-200 focus:bg-white focus:border-gray-300 transition-colors text-[14px] placeholder:text-gray-400"
            disabled={submitting}
          />
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!text.trim() || submitting}
              className="text-xs px-4"
            >
              {submitting ? 'Posting...' : replyingToAuthor ? 'Reply' : 'Comment'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function PrivateComments({
  post,
  comments,
  viewerContext,
  onLoadReplies,
  onSubmitComment,
  onSubmitReply,
  currentUser,
  onAuthorClick,
}: PrivateCommentsProps) {
  const [replyContext, setReplyContext] = useState<{
    parentCommentId: string;
    targetAuthor: CommentAuthor;
  } | null>(null);
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);

  const handleSelectForReply = useCallback((parentComment: Comment, targetAuthor: CommentAuthor) => {
    setSelectedCommentId(parentComment.id);
    setReplyContext({ parentCommentId: parentComment.id, targetAuthor });
  }, []);

  const handleCancelReply = useCallback(() => {
    setSelectedCommentId(null);
    setReplyContext(null);
  }, []);

  const handleSubmit = useCallback(
    async (text: string) => {
      if (replyContext) {
        await onSubmitReply(
          replyContext.parentCommentId,
          text,
          replyContext.targetAuthor.id
        );
        setSelectedCommentId(null);
        setReplyContext(null);
      } else {
        await onSubmitComment(text);
      }
    },
    [replyContext, onSubmitComment, onSubmitReply]
  );

  return (
    <div className="bg-white">
      {/* Optional Post Header */}
      {post && (
        <div className="border-b border-gray-100 pb-4 mb-2">
          <div className="flex gap-3">
            <UserAvatar
              author={post.author}
              onClick={onAuthorClick ? () => onAuthorClick(post.author) : undefined}
            />
            <div className="min-w-0 flex-1">
              <CommentHeader author={post.author} time={post.time} onAuthorClick={onAuthorClick} />
              <p className="mt-1 text-[15px] leading-[1.45] text-gray-900 whitespace-pre-wrap break-words">
                {post.text}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Comments List */}
      <div className="divide-y divide-gray-50">
        {comments.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            viewerContext={viewerContext}
            onLoadReplies={onLoadReplies}
            onSelectForReply={handleSelectForReply}
            onAuthorClick={onAuthorClick}
            isSelected={selectedCommentId === comment.id}
          />
        ))}
      </div>

      {/* Global Composer */}
      {currentUser && (
        <Composer
          currentUser={currentUser}
          replyingToAuthor={replyContext?.targetAuthor || null}
          onCancelReply={handleCancelReply}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}

export default PrivateComments;
