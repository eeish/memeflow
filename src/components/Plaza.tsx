import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PostComposer } from './PostComposer';
import { FeedTabs } from './FeedTabs';
import { Pencil, X } from './ui-simple/Icons';
import type { FeedTab } from './FeedTabs';
import { Holdings } from './Holdings';
import { FeedPostCard } from './feed/FeedPostCard';
import { DeletePostDialog } from './DeletePostDialog';
import type { FeedPostItem } from './feed/types';
import { formatTimeAgo, inferMediaType } from '../lib/feed';
import { apiService } from '../lib/api';
import { useNotifications } from '../contexts/NotificationContext';
import { useFeed } from '../hooks/useFeed';
import type { FeedTab as FeedHookTab } from '../hooks/useFeed';
import type { TradePageContext } from '../types/trade';

interface PlazaProps {
  user: any;
  onNavigateToProfile?: (profile: any) => void;
  onOpenTrade?: (market: TradePageContext) => void;
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function PostSkeleton() {
  return (
    <div className="border-b border-gray-100 px-4 py-4 animate-pulse">
      <div className="flex gap-3">
        <div className="w-9 h-9 rounded-full bg-gray-200 flex-shrink-0" />
        <div className="flex-1 space-y-2 pt-0.5">
          <div className="h-3 bg-gray-200 rounded w-1/4" />
          <div className="h-3 bg-gray-200 rounded w-full" />
          <div className="h-3 bg-gray-200 rounded w-3/4" />
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export const Plaza: React.FC<PlazaProps> = ({ user, onNavigateToProfile, onOpenTrade }) => {
  const [activeTab, setActiveTab] = useState<FeedTab>('trending');
  const [composerMounted, setComposerMounted] = useState(false);
  const [composerVisible, setComposerVisible] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [postToDelete, setPostToDelete] = useState<FeedPostItem | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [fadingOutPostId, setFadingOutPostId] = useState<string | null>(null);
  const { success: showSuccess, error: showError } = useNotifications();

  const openComposer = useCallback(() => {
    setComposerMounted(true);
    // Double rAF ensures the element is painted before the transition fires.
    requestAnimationFrame(() => requestAnimationFrame(() => setComposerVisible(true)));
  }, []);

  const closeComposer = useCallback(() => {
    setComposerVisible(false);
    setTimeout(() => setComposerMounted(false), 320);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeComposer(); };
    if (composerMounted) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [composerMounted, closeComposer]);

  // Only 'trending' and 'following' use the feed hook; 'holdings' renders its
  // own component. Cast is safe because Holdings is excluded below.
  const feedTab: FeedHookTab = activeTab === 'following' ? 'following' : 'trending';

  const {
    posts,
    isLoading,
    isFetchingMore,
    hasMore,
    newCount,
    error,
    loadMore,
    refresh,
    prependPost,
    removePost,
    updateCommentCount,
  } = useFeed(feedTab);

  // ── IntersectionObserver sentinel (infinite scroll) ────────────────────────

  const sentinelRef = useRef<HTMLDivElement>(null);
  // Use a ref to always call the latest loadMore without recreating the observer.
  const loadMoreRef = useRef(loadMore);
  useEffect(() => { loadMoreRef.current = loadMore; });

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMoreRef.current();
      },
      { rootMargin: '300px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []); // Set up once — loadMoreRef always points to the latest callback.

  // ── Post creation (optimistic) ─────────────────────────────────────────────

  const handleNewPost = (
    content: string,
    attachment?: { type: 'image' | 'video'; url: string },
  ) => {
    const newPost: FeedPostItem = {
      id: Date.now().toString(),
      author: {
        id: user.id,
        username: user.username,
        avatarUrl: user.avatar_url,
        bio: user.bio,
        tokenSymbol: user.token_symbol,
        walletAddress: user.wallet_address,
        followersCount: user.followers_count,
        holdersCount: user.followers_count,
      },
      content,
      timestamp: 'now',
      createdAt: new Date().toISOString(),
      likesCount: 0,
      commentsCount: 0,
      media: attachment ? [{ type: attachment.type, url: attachment.url }] : undefined,
    };
    prependPost(newPost);
  };

  // ── Delete flow ────────────────────────────────────────────────────────────

  const handleDeleteClick = (post: FeedPostItem) => {
    setPostToDelete(post);
    setDeleteError(null);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!user?.id || !postToDelete || deletingPostId) return;

    const postId = postToDelete.id;
    setDeleteError(null);
    setDeletingPostId(postId);

    try {
      const response = await apiService.deletePost(postId, user.id);
      if (response.success && response.data) {
        setDeleteDialogOpen(false);
        setFadingOutPostId(postId);
        setTimeout(() => {
          removePost(postId);
          setFadingOutPostId(null);
          showSuccess('Post deleted successfully');
        }, 300);
      } else {
        setDeleteError(response.error || 'Failed to delete post');
        showError(response.error || 'Failed to delete post');
      }
    } catch {
      setDeleteError('Failed to delete post');
      showError('Failed to delete post');
    } finally {
      setDeletingPostId(null);
      setPostToDelete(null);
    }
  };

  const canDeletePost = (post: FeedPostItem) =>
    !!user?.id && post.author.id === user.id;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="pb-20">
        <FeedTabs activeTab={activeTab} onTabChange={setActiveTab} />

        {activeTab === 'holdings' ? (
          <Holdings onNavigateToProfile={onNavigateToProfile} />
        ) : (
          <div className="max-w-3xl mx-auto bg-white relative">

            {/* ── New-posts pill ───────────────────────────────────────── */}
            {newCount > 0 && (
              <div className="sticky top-0 z-10 flex justify-center pt-3 pb-1 pointer-events-none">
                <button
                  onClick={refresh}
                  className="pointer-events-auto inline-flex items-center gap-1.5 bg-gray-900 text-white text-xs font-medium px-4 py-1.5 rounded-full shadow-lg hover:bg-gray-700 active:scale-95 transition-all"
                >
                  ↑ {newCount} new {newCount === 1 ? 'post' : 'posts'}
                </button>
              </div>
            )}

            {/* ── Error banner ─────────────────────────────────────────── */}
            {error && (
              <div className="px-4 py-3 text-sm text-red-600 bg-red-50 border-b border-red-100">
                {error}
              </div>
            )}

            {/* ── Initial loading skeletons ─────────────────────────────── */}
            {isLoading && (
              <>
                <PostSkeleton />
                <PostSkeleton />
                <PostSkeleton />
              </>
            )}

            {/* ── Feed ─────────────────────────────────────────────────── */}
            {!isLoading && (
              <>
                {posts.map((post) => (
                  <FeedPostCard
                    key={post.id}
                    post={post}
                    tone="light"
                    onAuthorClick={onNavigateToProfile}
                    onOpenTrade={onOpenTrade}
                    canDelete={canDeletePost(post)}
                    onDelete={() => handleDeleteClick(post)}
                    isFadingOut={fadingOutPostId === post.id}
                    currentUserId={user?.id}
                    currentUsername={user?.username}
                    currentAvatarUrl={user?.avatar_url}
                    onCommentCountChange={updateCommentCount}
                  />
                ))}

                {/* Empty state */}
                {posts.length === 0 && (
                  <div className="py-20 text-center text-gray-400 text-sm">
                    {activeTab === 'following'
                      ? 'Follow some creators to see their posts here.'
                      : 'No posts yet. Be the first to share something.'}
                  </div>
                )}

                {/* Loading-more spinner */}
                {isFetchingMore && (
                  <div className="py-5 flex justify-center">
                    <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
                  </div>
                )}

                {/* End of feed */}
                {!hasMore && posts.length > 0 && (
                  <p className="py-8 text-center text-xs text-gray-400">
                    You're all caught up
                  </p>
                )}

                {/* IntersectionObserver sentinel — triggers loadMore */}
                <div ref={sentinelRef} className="h-1" aria-hidden="true" />
              </>
            )}
          </div>
        )}
      </main>

      {/* ── Floating compose button ──────────────────────────────────────────── */}
      <button
        onClick={openComposer}
        aria-label="New post"
        className="fixed z-30
          bottom-24 right-4
          sm:bottom-8 sm:right-auto sm:left-1/2 sm:-translate-x-1/2
          lg:bottom-8 lg:top-auto lg:left-[calc(50%+400px)] lg:translate-x-0 lg:translate-y-0
          w-14 h-14 rounded-full bg-gray-900 text-white shadow-xl
          flex items-center justify-center
          hover:bg-gray-700 active:scale-95
          transition-transform duration-150 ease-out
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
      >
        <Pencil className="w-5 h-5" strokeWidth={2} />
      </button>

      {/* ── Composer modal ───────────────────────────────────────────────────── */}
      {composerMounted && (
        <>
          {/* Backdrop */}
          <div
            className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 ease-out ${
              composerVisible ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
            onClick={closeComposer}
            aria-hidden="true"
          />

          {/* Sheet / card */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="New post"
            className={`
              fixed z-50 bg-white w-full
              left-0 bottom-0 rounded-t-2xl
              sm:left-1/2 sm:bottom-auto sm:top-1/2 sm:w-full sm:max-w-2xl sm:rounded-2xl
              shadow-2xl
              transition-all duration-300 ease-out
              ${composerVisible
                ? 'opacity-100 translate-y-0 sm:scale-100 sm:-translate-x-1/2 sm:-translate-y-1/2'
                : 'opacity-0 translate-y-full sm:scale-95 sm:-translate-x-1/2 sm:-translate-y-[45%]'
              }
            `}
          >
            {/* Handle + header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100">
              {/* Mobile drag handle */}
              <div className="absolute top-2 left-1/2 -translate-x-1/2 w-9 h-1 rounded-full bg-gray-200 sm:hidden" />
              <h2 className="text-sm font-semibold text-gray-900 mt-1 sm:mt-0">New Post</h2>
              <button
                onClick={closeComposer}
                aria-label="Close"
                className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors -mr-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Composer body */}
            <div className="[&_textarea]:sm:min-h-[180px]">
              <PostComposer
                onPost={(content, attachment) => {
                  handleNewPost(content, attachment);
                  closeComposer();
                }}
              />
            </div>
          </div>
        </>
      )}

      <DeletePostDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        postContent={postToDelete?.content || ''}
        onConfirm={handleConfirmDelete}
        isDeleting={!!deletingPostId}
        error={deleteError}
      />
    </div>
  );
};
