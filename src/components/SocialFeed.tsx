import React, { useState, useEffect } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Avatar, AvatarImage, AvatarFallback } from './ui/avatar';
import { Textarea } from './ui/textarea';
import { Alert, AlertDescription } from './ui/alert';
import { Send, AlertCircle, Sparkles } from 'lucide-react';
import { apiService, type PostWithAuthor, type FollowStatusResponse } from '../lib/api';
import { MinimalPostCard } from './MinimalPostCard';

interface SocialFeedProps {
  user: any;
}

export const SocialFeed: React.FC<SocialFeedProps> = ({ user }) => {
  const [posts, setPosts] = useState<PostWithAuthor[]>([]);
  const [newPost, setNewPost] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [followStatuses, setFollowStatuses] = useState<{[key: string]: FollowStatusResponse}>({});
  const [userLikes, setUserLikes] = useState<{[key: string]: boolean}>({});

  useEffect(() => {
    fetchPosts();
  }, [user]);

  const fetchPosts = async () => {
    try {
      setError('');
      let response;
      
      // If user has an ID, get their personalized feed, otherwise get general posts
      if (user?.id) {
        response = await apiService.getNewsFeed(user.id);
      } else {
        response = await apiService.getPosts();
      }
      
      if (response.success && response.data) {
        setPosts(response.data);
        
        // Pre-fetch follow statuses for all unique authors
        if (user?.id) {
          const uniqueAuthors = Array.from(new Set(response.data.map(post => post.author_id)))
            .filter(authorId => authorId !== user.id);
          
          for (const authorId of uniqueAuthors) {
            try {
              const followResponse = await apiService.getFollowStatus(authorId, user.id);
              if (followResponse.success && followResponse.data) {
                setFollowStatuses(prev => ({
                  ...prev,
                  [authorId]: followResponse.data!
                }));
              }
            } catch (error) {
              console.warn(`Failed to fetch follow status for user ${authorId}:`, error);
            }
          }
        }
      } else {
        setError(response.error || 'Failed to load posts');
      }
    } catch (error) {
      console.error('Failed to fetch posts:', error);
      setError('Failed to load posts');
    }
  };

  const handleCreatePost = async () => {
    if (!newPost.trim() || !user?.id) return;
    
    setLoading(true);
    try {
      const response = await apiService.createPost({
        author_id: user.id,
        content: newPost,
        media_urls: []
      });
      
      if (response.success && response.data) {
        // Refresh posts to get the updated feed
        await fetchPosts();
        setNewPost('');
      } else {
        setError(response.error || 'Failed to create post');
      }
    } catch (error) {
      console.error('Failed to create post:', error);
      setError('Failed to create post');
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async (postId: string) => {
    if (!user?.id) return;
    
    try {
      const response = await apiService.likePost(postId, user.id);
      
      if (response.success) {
        const isNowLiked = response.data;
        
        // Update the local state
        setPosts(posts.map(post => 
          post.id === postId 
            ? { 
                ...post, 
                likes_count: isNowLiked ? post.likes_count + 1 : post.likes_count - 1
              }
            : post
        ));
        
        // Track user's like status
        setUserLikes(prev => ({
          ...prev,
          [postId]: isNowLiked ?? false
        }));
      } else {
        setError('Failed to like post');
      }
    } catch (error) {
      console.error('Failed to like post:', error);
      setError('Failed to like post');
    }
  };

  const handleFollow = async (userId: string) => {
    if (!user?.id) return;

    try {
      const isCurrentlyFollowing = followStatuses[userId]?.is_following;
      let response;
      
      if (isCurrentlyFollowing) {
        response = await apiService.unfollowUser(userId, user.id);
      } else {
        response = await apiService.followUser(userId, user.id);
      }
      
      if (response.success && response.data) {
        setFollowStatuses(prev => ({
          ...prev,
          [userId]: response.data!
        }));
      } else {
        setError(response.error || 'Failed to update follow status');
      }
    } catch (error) {
      console.error('Failed to update follow status:', error);
      setError('Failed to update follow status');
    }
  };


  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-2xl font-semibold text-neutral-900">
          Feed
        </h2>
        <div className="flex items-center space-x-2 text-sm text-neutral-500">
          <Sparkles className="w-4 h-4 text-emerald-500" />
          <span>Live</span>
        </div>
      </div>

      {error && (
        <Alert className="border-red-200 bg-red-50 rounded-xl">
          <AlertCircle className="w-4 h-4 text-red-500" />
          <AlertDescription className="text-red-700">{error}</AlertDescription>
        </Alert>
      )}

      {/* Create Post */}
      <Card className="bg-white border-neutral-100 rounded-2xl p-5 shadow-sm">
        <div className="flex space-x-3.5">
          <Avatar className="w-11 h-11 bg-gradient-to-br from-neutral-200 to-neutral-300 flex items-center justify-center">
            <span className="text-neutral-700 font-medium text-sm">
              {user.username ? user.username[0].toUpperCase() : 'U'}
            </span>
          </Avatar>
          <div className="flex-1">
            <Textarea
              placeholder="Share your thoughts..."
              value={newPost}
              onChange={(e) => setNewPost(e.target.value)}
              className="bg-neutral-50 border-neutral-200 text-neutral-900 placeholder-neutral-400 min-h-[80px] resize-none rounded-xl text-[15px] focus:bg-white transition-colors"
              maxLength={280}
            />
            <div className="flex items-center justify-between mt-3">
              <span className="text-sm text-neutral-500">
                {280 - newPost.length}
              </span>
              <Button
                onClick={handleCreatePost}
                disabled={!newPost.trim() || loading}
                className="bg-neutral-900 text-white hover:bg-neutral-800 rounded-xl px-4 h-9 font-medium transition-all disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5 mr-1.5" />
                {loading ? 'Posting...' : 'Post'}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Posts */}
      <div className="space-y-3">
        {posts.map((post) => {
          const followStatus = followStatuses[post.author_id];
          const isLiked = userLikes[post.id] ?? false;
          
          return (
            <MinimalPostCard
              key={post.id}
              post={{
                ...post,
                author: {
                  ...post.author,
                  token_price: Math.random() * 0.5 + 0.01, // Mock price for demo
                  token_symbol: 'MEME'
                }
              }}
              user={user}
              onLike={handleLike}
              onFollow={handleFollow}
              onBuy={(userId) => console.log('Buy token for user:', userId)}
              isFollowing={followStatus?.is_following}
              isLiked={isLiked}
            />
          );
        })}
      </div>
      
      {posts.length === 0 && (
        <Card className="bg-white border-neutral-100 rounded-2xl p-12 text-center">
          <Sparkles className="w-14 h-14 text-neutral-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-neutral-700 mb-2">No posts yet</h3>
          <p className="text-neutral-500 text-sm">Be the first to share something!</p>
        </Card>
      )}
    </div>
  );
};