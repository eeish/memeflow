import React, { useState, useEffect } from 'react';
import { PostComposer } from './PostComposer';
import { FeedTabs, type FeedTab } from './FeedTabs';
import { Holdings } from './Holdings';
import { Alert, AlertDescription } from './ui-simple/Alert';
import { AlertCircle } from './ui-simple/Icons';
import { FeedPostCard } from './feed/FeedPostCard';
import { DeletePostDialog } from './DeletePostDialog';
import type { FeedPostItem } from './feed/types';
import { formatTimeAgo, inferMediaType } from '../lib/feed';
import { apiService } from '../lib/api';
import { useNotifications } from '../contexts/NotificationContext';
import type { TradePageContext } from '../types/trade';

interface PlazaProps {
  user: any;
  onNavigateToProfile?: (profile: any) => void;
  onOpenTrade?: (market: TradePageContext) => void;
}

export const Plaza: React.FC<PlazaProps> = ({ user, onNavigateToProfile, onOpenTrade }) => {
  const [posts, setPosts] = useState<FeedPostItem[]>([]);
  const [activeTab, setActiveTab] = useState<FeedTab>('trending');
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [postToDelete, setPostToDelete] = useState<FeedPostItem | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [fadingOutPostId, setFadingOutPostId] = useState<string | null>(null);
  const { success: showSuccess, error: showError } = useNotifications();

  // Fetch posts from backend
  useEffect(() => {
    const fetchPlazaPosts = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/plaza?limit=50&offset=0');
        const data = await response.json();

        if (data.success && data.data && data.data.length > 0) {
          // Convert backend posts to our Post format
          const convertedPosts: FeedPostItem[] = data.data.map((p: any) => {
            const mediaUrls = Array.isArray(p.media_urls) ? p.media_urls : [];
            return {
              id: p.id,
              author: {
                id: p.author.id,
                username: p.author.username,
                avatarUrl: p.author.avatar_url,
                bio: p.author.bio,
                tokenSymbol: p.author.token_symbol,
                walletAddress: p.author.wallet_address,
                followersCount: p.author.followers_count,
                holdersCount: p.author.followers_count,
              },
              content: p.content,
              timestamp: formatTimeAgo(p.created_at),
              likesCount: p.likes_count || 0,
              commentsCount: p.comments_count || 0,
              media: mediaUrls.map((url: string) => ({ type: inferMediaType(url), url })),
            };
          });
          setPosts(convertedPosts);
        }
      } catch (err) {
        console.log('Backend not available');
      }
    };

    fetchPlazaPosts();
  }, []);

  const handleNewPost = (content: string, attachment?: { type: 'image' | 'video'; url: string; blobId?: string }) => {
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
      likesCount: 0,
      commentsCount: 0,
      media: attachment ? [{ type: attachment.type, url: attachment.url }] : undefined,
    };
    setPosts([newPost, ...posts]);
  };

  const handleDeleteClick = (post: FeedPostItem) => {
    setPostToDelete(post);
    setDeleteError(null);
    setDeleteDialogOpen(true);
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

  const canDeletePost = (post: FeedPostItem) => {
    return user?.id && post.author.id === user.id;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="pb-20">
        <PostComposer onPost={handleNewPost} />
        <FeedTabs activeTab={activeTab} onTabChange={setActiveTab} />

        {activeTab === 'holdings' ? (
          <Holdings onNavigateToProfile={onNavigateToProfile} />
        ) : (
          <div className="max-w-3xl mx-auto bg-white">
            {error && (
              <div className="p-4">
                <Alert className="border-red-200 bg-red-50">
                  <AlertCircle className="w-4 h-4 text-red-600" />
                  <AlertDescription className="text-red-700">{error}</AlertDescription>
                </Alert>
              </div>
            )}

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
                onCommentCountChange={(postId, count) => {
                  setPosts((prev) =>
                    prev.map((item) => (item.id === postId ? { ...item, commentsCount: count } : item))
                  );
                }}
              />
            ))}

            {/* Empty state */}
            {posts.length === 0 && (
              <div className="py-20 text-center text-gray-400">
                <p>No posts yet. Be the first to share something.</p>
              </div>
            )}
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
    </div>
  );
};
