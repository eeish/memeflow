import React, { useState, useEffect } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Avatar } from './ui/avatar';
import { Textarea } from './ui/textarea';
import { Alert, AlertDescription } from './ui/alert';
import { Heart, MessageCircle, Repeat2, Share, TrendingUp, Send, AlertCircle, Sparkles, UserPlus } from 'lucide-react';
import { apiService, type PostWithAuthor, type FollowStatusResponse } from '../lib/api';

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

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 60) {
      return `${diffInMinutes}m`;
    } else if (diffInMinutes < 1440) {
      return `${Math.floor(diffInMinutes / 60)}h`;
    } else {
      return `${Math.floor(diffInMinutes / 1440)}d`;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-transparent bg-gradient-to-r from-cyan-400 via-pink-400 to-purple-400 bg-clip-text">
          Social Feed
        </h2>
        <div className="flex items-center space-x-2 text-sm text-white/60">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <span>Live updates</span>
        </div>
      </div>

      {error && (
        <Alert className="border-red-500 bg-red-500/10">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription className="text-red-400">{error}</AlertDescription>
        </Alert>
      )}

      {/* Create Post */}
      <Card className="glass border border-white/10 p-6">
        <div className="flex space-x-4">
          <Avatar className="w-12 h-12 bg-gradient-to-r from-cyan-400 to-purple-400 flex items-center justify-center">
            <span className="text-white font-bold">
              {user.username ? user.username[0].toUpperCase() : 'U'}
            </span>
          </Avatar>
          <div className="flex-1">
            <Textarea
              placeholder="What's happening in the meme verse?"
              value={newPost}
              onChange={(e) => setNewPost(e.target.value)}
              className="bg-white/5 border-white/20 text-white placeholder-white/50 min-h-[100px] resize-none"
              maxLength={280}
            />
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-white/60">
                {280 - newPost.length} characters remaining
              </span>
              <Button
                onClick={handleCreatePost}
                disabled={!newPost.trim() || loading}
                className="bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-600 hover:to-pink-600"
              >
                <Send className="w-4 h-4 mr-2" />
                {loading ? 'Posting...' : 'Post'}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Posts */}
      <div className="space-y-4">
        {posts.map((post) => {
          const isOwnPost = user?.id === post.author_id;
          const followStatus = followStatuses[post.author_id];
          const isLiked = userLikes[post.id] ?? false;
          
          return (
            <Card key={post.id} className="glass border border-white/10 p-6 hover:border-white/20 transition-all duration-300">
              <div className="flex space-x-4">
                <Avatar className="w-12 h-12 bg-gradient-to-r from-cyan-400 to-purple-400 flex items-center justify-center">
                  <span className="text-white font-bold">
                    {post.author.username[0].toUpperCase()}
                  </span>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-white">@{post.author.username}</span>
                      {post.author.display_name && (
                        <span className="text-white/70">({post.author.display_name})</span>
                      )}
                      <span className="text-white/50 text-sm">·</span>
                      <span className="text-white/50 text-sm">{formatTimeAgo(post.created_at)}</span>
                    </div>
                    
                    {/* Follow button - only show if not own post and user is logged in */}
                    {!isOwnPost && user?.id && (
                      <Button
                        variant={followStatus?.is_following ? "outline" : "default"}
                        size="sm"
                        onClick={() => handleFollow(post.author_id)}
                        className={`text-xs px-3 py-1 ${
                          followStatus?.is_following
                            ? 'bg-white/10 text-white hover:bg-red-500/20 hover:text-red-300 border-white/20'
                            : 'bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-600 hover:to-pink-600 text-white'
                        }`}
                      >
                        <UserPlus className="w-3 h-3 mr-1" />
                        {followStatus?.is_following ? 'Unfollow' : 'Follow'}
                      </Button>
                    )}
                  </div>
                  
                  <p className="text-white/90 mb-4 leading-relaxed">{post.content}</p>
                  
                  {/* Token mention detection - simple regex */}
                  {(() => {
                    const tokenMention = post.content.match(/\$([A-Z]+)/);
                    if (tokenMention) {
                      return (
                        <Card className="glass border border-white/10 p-3 mb-4 bg-gradient-to-r from-cyan-500/10 to-pink-500/10">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <TrendingUp className="w-5 h-5 text-cyan-400" />
                              <span className="font-semibold text-white">${tokenMention[1]}</span>
                            </div>
                            <div className="flex items-center space-x-4">
                              <span className="text-white/70">Token mentioned</span>
                              <span className="text-cyan-400 text-sm px-2 py-1 rounded bg-cyan-500/20">
                                🚀 Trending
                              </span>
                            </div>
                          </div>
                        </Card>
                      );
                    }
                    return null;
                  })()}
                  
                  <div className="flex items-center justify-between text-white/60">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleLike(post.id)}
                      className={`hover:bg-pink-500/20 hover:text-pink-400 ${
                        isLiked ? 'text-pink-400' : ''
                      }`}
                    >
                      <Heart className={`w-4 h-4 mr-1 ${isLiked ? 'fill-current' : ''}`} />
                      {post.likes_count}
                    </Button>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      className="hover:bg-cyan-500/20 hover:text-cyan-400"
                    >
                      <MessageCircle className="w-4 h-4 mr-1" />
                      {post.comments_count}
                    </Button>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      className="hover:bg-green-500/20 hover:text-green-400"
                    >
                      <Repeat2 className="w-4 h-4 mr-1" />
                      {post.reposts_count}
                    </Button>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      className="hover:bg-purple-500/20 hover:text-purple-400"
                    >
                      <Share className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      
      {posts.length === 0 && (
        <Card className="glass border border-white/10 p-12 text-center">
          <Sparkles className="w-16 h-16 text-white/30 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white/70 mb-2">No posts yet</h3>
          <p className="text-white/50">Be the first to share something in the meme verse!</p>
        </Card>
      )}
    </div>
  );
};