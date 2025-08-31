import React, { useState, useEffect } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Textarea } from './ui/textarea';
import { Alert, AlertDescription } from './ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { HoverCard, HoverCardContent, HoverCardTrigger } from './ui/hover-card';
import { FollowButton } from './FollowButton';
import { useSocialFollow } from '../hooks/useSocialFollow';
import { 
  Heart, 
  MessageCircle, 
  Repeat2, 
  Share, 
  TrendingUp,
  Send,
  AlertCircle,
  Star,
  Users,
  Flame,
  MoreHorizontal
} from 'lucide-react';

interface PlazaPost {
  id: string;
  author_id: string;
  content: string;
  media_urls: string[];
  likes_count: number;
  comments_count: number;
  reposts_count: number;
  created_at: string;
  updated_at: string;
  author: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    token_symbol: string;
  };
}

interface PlazaProps {
  user: any;
}

export const Plaza: React.FC<PlazaProps> = ({ user }) => {
  const [posts, setPosts] = useState<PlazaPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newPost, setNewPost] = useState('');
  const [posting, setPosting] = useState(false);
  const [activeTab, setActiveTab] = useState('ranked');
  const [followingList, setFollowingList] = useState<string[]>([]);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const { userProfile, followUser } = useSocialFollow();

  const fetchPlazaPosts = async () => {
    try {
      setError(null);
      const response = await fetch('http://localhost:3001/api/plaza?limit=50&offset=0');
      const data = await response.json();
      
      if (data.success) {
        setPosts(data.data || []);
      } else {
        setError('Failed to load plaza posts');
      }
    } catch (err) {
      console.error('Error fetching plaza posts:', err);
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };


  const handleCreatePost = async () => {
    if (!newPost.trim() || !user?.id) return;
    
    setPosting(true);
    try {
      setError(null);
      const response = await fetch('http://localhost:3001/api/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          author_id: user.id,
          content: newPost.trim()
        })
      });

      const data = await response.json();
      
      if (data.success) {
        // Clear the input and refresh posts
        setNewPost('');
        await fetchPlazaPosts();
      } else {
        setError(data.error || 'Failed to create post');
      }
    } catch (err) {
      console.error('Error creating post:', err);
      setError('Failed to create post');
    } finally {
      setPosting(false);
    }
  };

  useEffect(() => {
    fetchPlazaPosts();
    loadFollowingList();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchPlazaPosts, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadFollowingList = () => {
    // Load user's following list from localStorage or API
    const savedFollowing = localStorage.getItem(`following_${user?.username}`);
    if (savedFollowing) {
      setFollowingList(JSON.parse(savedFollowing));
    }
  };

  const calculatePostScore = (post: PlazaPost) => {
    // Ranking algorithm - higher scores appear first
    const hoursAgo = (Date.now() - new Date(post.created_at).getTime()) / (1000 * 60 * 60);
    const engagement = post.likes_count + (post.comments_count * 2) + (post.reposts_count * 1.5);
    const recencyBonus = Math.max(0, 24 - hoursAgo) / 24; // Boost for recent posts
    const engagementScore = engagement * (1 + recencyBonus);
    
    // Bonus for high engagement posts
    const viralBonus = engagement > 10 ? 1.5 : 1;
    
    return engagementScore * viralBonus;
  };

  const getRankedPosts = () => {
    return [...posts].sort((a, b) => calculatePostScore(b) - calculatePostScore(a));
  };

  const getFollowedPosts = () => {
    return posts.filter(post => followingList.includes(post.author.username));
  };

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const postDate = new Date(dateString);
    const diffInSeconds = Math.floor((now.getTime() - postDate.getTime()) / 1000);
    
    if (diffInSeconds < 60) return 'just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d`;
    if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 604800)}w`;
    return `${Math.floor(diffInSeconds / 2592000)}mo`;
  };

  const formatPrice = (price?: number) => {
    if (!price) return '0.0000';
    return price < 1 ? price.toFixed(4) : price.toFixed(2);
  };

  const handleLikePost = (postId: string) => {
    setLikedPosts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(postId)) {
        newSet.delete(postId);
      } else {
        newSet.add(postId);
      }
      return newSet;
    });
  };

  const getAvatarFallback = (username: string) => {
    return username.charAt(0).toUpperCase();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="bg-white border border-[#ECECEC] p-6 animate-pulse">
              <div className="flex space-x-4">
                <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
                <div className="flex-1 space-y-3">
                  <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Card className="bg-white border border-red-200 p-6 text-center">
          <div className="text-red-600 mb-4">{error}</div>
          <Button onClick={fetchPlazaPosts} variant="outline" className="border-red-300 text-red-600 hover:bg-red-50">
            Try Again
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Error Alert */}
      {error && (
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="w-4 h-4 text-red-600" />
          <AlertDescription className="text-red-700">{error}</AlertDescription>
        </Alert>
      )}

      {/* Create Post - Refined Design */}
      {user && (
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-gray-100/50 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] transition-shadow duration-300">
          <div className="flex gap-4">
            <Avatar className="w-11 h-11 flex-shrink-0 ring-2 ring-indigo-50">
              {(user.avatar_url || user.avatar) && (
                <AvatarImage src={user.avatar_url || user.avatar} alt={`@${user.username}`} />
              )}
              <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-semibold text-sm">
                {user.username ? user.username[0].toUpperCase() : 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-4">
              <Textarea
                placeholder="Share your thoughts with the community..."
                value={newPost}
                onChange={(e) => setNewPost(e.target.value)}
                className="w-full bg-indigo-50/30 border border-gray-100 text-gray-900 placeholder:text-gray-400 min-h-[110px] resize-none focus:outline-none focus:border-indigo-300 focus:bg-indigo-50/50 focus:ring-2 focus:ring-indigo-100/50 px-4 py-3 rounded-xl font-['Inter',_'Roboto',_-apple-system,_BlinkMacSystemFont,_'SF_Pro_Text',_sans-serif] text-[15px] leading-relaxed transition-all duration-200 hover:bg-indigo-50/40"
                maxLength={280}
              />
              
              <div className="flex items-center justify-between">
                {/* Character limit indicator with clear label */}
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 font-medium">Characters:</span>
                    <span className={`text-sm font-semibold transition-colors ${
                      newPost.length > 250 ? 'text-rose-500' : 
                      newPost.length > 200 ? 'text-amber-500' : 
                      'text-gray-600'
                    }`}>
                      {newPost.length}/280
                    </span>
                  </div>
                  
                  {/* Visual indicator bar */}
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden shadow-inner">
                      <div 
                        className={`h-full transition-all duration-300 rounded-full ${
                          newPost.length > 250 ? 'bg-gradient-to-r from-rose-400 to-rose-500' : 
                          newPost.length > 200 ? 'bg-gradient-to-r from-amber-400 to-amber-500' : 
                          newPost.length > 0 ? 'bg-gradient-to-r from-indigo-400 to-indigo-500' : 'bg-gray-200'
                        }`}
                        style={{ width: `${Math.min((newPost.length / 280) * 100, 100)}%` }}
                      />
                    </div>
                    {newPost.length > 250 && (
                      <span className="text-xs text-rose-500 font-medium animate-pulse">
                        {280 - newPost.length} left
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  {user.username && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50/50 rounded-lg border border-indigo-100/50">
                      <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"></div>
                      <span className="text-xs text-indigo-600 font-medium">
                        @{user.username}
                      </span>
                    </div>
                  )}
                  <Button
                    onClick={handleCreatePost}
                    disabled={!newPost.trim() || posting || !user?.id || newPost.length > 280}
                    className="bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed text-white font-semibold px-7 py-2.5 rounded-xl text-sm transition-all duration-200 shadow-[0_2px_4px_rgba(0,0,0,0.1)] hover:shadow-[0_4px_8px_rgba(0,0,0,0.15)] flex items-center gap-2"
                  >
                    {posting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Posting...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Post</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabbed Posts Feed */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 bg-gray-50 rounded-lg p-1">
          <TabsTrigger value="ranked" className="text-gray-600 font-medium data-[state=active]:text-indigo-700 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md py-2.5 transition-all duration-200">
            <Flame className="w-4 h-4 mr-2" />
            Trending Posts
          </TabsTrigger>
          <TabsTrigger value="followed" className="text-gray-600 font-medium data-[state=active]:text-indigo-700 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md py-2.5 transition-all duration-200">
            <Users className="w-4 h-4 mr-2" />
            Following Feed
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ranked" className="space-y-4">
          {getRankedPosts().length === 0 ? (
            <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-100">
              <Flame className="w-12 h-12 text-indigo-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-800 mb-2 font-['Inter',_'Roboto',_-apple-system,_BlinkMacSystemFont,_'SF_Pro_Text',_sans-serif]">No trending posts yet</h3>
              <p className="text-sm text-gray-600 font-['Inter',_'Roboto',_-apple-system,_BlinkMacSystemFont,_'SF_Pro_Text',_sans-serif]">
                Be the first to share something with the community
              </p>
            </div>
          ) : (
            getRankedPosts().map((post) => {
              const isLiked = likedPosts.has(post.id);
              const currentPrice = userProfile?.currentPrice ? Number(userProfile.currentPrice) / 1e9 : 0.001;
              
              return (
                <article key={post.id} className="bg-white rounded-xl p-6 transition-all duration-200 hover:shadow-md shadow-sm border border-gray-100 font-['Inter',_'Roboto',_-apple-system,_BlinkMacSystemFont,_'SF_Pro_Text',_sans-serif]">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-start gap-3">
                      <HoverCard openDelay={200} closeDelay={100}>
                        <HoverCardTrigger asChild>
                          <button className="focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-full">
                            <Avatar className="w-10 h-10 ring-2 ring-white shadow-sm cursor-pointer transition-transform hover:scale-105">
                              {post.author.avatar_url && (
                                <AvatarImage src={post.author.avatar_url} alt={post.author.display_name || post.author.username} />
                              )}
                              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-sm font-medium">
                                {getAvatarFallback(post.author.username)}
                              </AvatarFallback>
                            </Avatar>
                          </button>
                        </HoverCardTrigger>
                        <HoverCardContent 
                          side="bottom" 
                          align="start" 
                          className="w-72 p-0 border-0 shadow-xl rounded-2xl overflow-hidden"
                          sideOffset={8}
                        >
                          {/* Hover Card Content */}
                          <div className="bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 p-[1px]">
                            <div className="bg-white rounded-2xl p-5">
                              {/* User Info */}
                              <div className="flex items-center gap-3 mb-4">
                                <Avatar className="w-12 h-12 ring-2 ring-white shadow-md">
                                  {post.author.avatar_url && (
                                    <AvatarImage src={post.author.avatar_url} alt={post.author.display_name || post.author.username} />
                                  )}
                                  <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                                    {getAvatarFallback(post.author.username)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-gray-900 truncate">{post.author.display_name || post.author.username}</p>
                                  <p className="text-sm text-gray-500">@{post.author.username}</p>
                                </div>
                              </div>

                              {/* Token Price */}
                              <div className="bg-gray-50 rounded-xl p-3 mb-4">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs font-medium text-gray-600">Share Price</span>
                                  <span className="text-xs text-green-600">+12.5%</span>
                                </div>
                                <div className="flex items-baseline gap-1">
                                  <span className="text-2xl font-bold text-gray-900">
                                    {formatPrice(currentPrice)}
                                  </span>
                                  <span className="text-sm font-medium text-gray-600">SUI</span>
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                  {userProfile?.followerCount || 0} holders
                                </div>
                              </div>

                              {/* Action Buttons */}
                              <div className="flex gap-2">
                                <Button 
                                  variant="outline"
                                  className="flex-1 h-10 rounded-xl font-medium border-gray-200 hover:bg-gray-50"
                                >
                                  Follow
                                </Button>
                                <Button 
                                  onClick={() => followUser?.(post.author.id, post.author.id, userProfile?.followerCount || 0)}
                                  className="flex-1 h-10 rounded-xl font-medium bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white border-0"
                                >
                                  Buy
                                </Button>
                              </div>
                            </div>
                          </div>
                        </HoverCardContent>
                      </HoverCard>

                      <div className="flex-1 min-w-0">
                        <HoverCard openDelay={200} closeDelay={100}>
                          <HoverCardTrigger asChild>
                            <button className="text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg px-1 -mx-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-gray-900 hover:underline">
                                  {post.author.display_name || post.author.username}
                                </span>
                                <span className="text-gray-500 text-sm">
                                  @{post.author.username}
                                </span>
                                <span className="text-gray-400 text-sm">·</span>
                                <span className="text-gray-500 text-sm">
                                  {formatTimeAgo(post.created_at)}
                                </span>
                              </div>
                            </button>
                          </HoverCardTrigger>
                          {/* Reuse the same hover card content */}
                          <HoverCardContent 
                            side="bottom" 
                            align="start" 
                            className="w-72 p-0 border-0 shadow-xl rounded-2xl overflow-hidden"
                            sideOffset={8}
                          >
                            <div className="bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 p-[1px]">
                              <div className="bg-white rounded-2xl p-5">
                                <div className="flex items-center gap-3 mb-4">
                                  <Avatar className="w-12 h-12 ring-2 ring-white shadow-md">
                                    {post.author.avatar_url && (
                                      <AvatarImage src={post.author.avatar_url} alt={post.author.display_name || post.author.username} />
                                    )}
                                    <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                                      {getAvatarFallback(post.author.username)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-gray-900 truncate">{post.author.display_name || post.author.username}</p>
                                    <p className="text-sm text-gray-500">@{post.author.username}</p>
                                  </div>
                                </div>
                                <div className="bg-gray-50 rounded-xl p-3 mb-4">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-medium text-gray-600">Share Price</span>
                                    <span className="text-xs text-green-600">+12.5%</span>
                                  </div>
                                  <div className="flex items-baseline gap-1">
                                    <span className="text-2xl font-bold text-gray-900">
                                      {formatPrice(currentPrice)}
                                    </span>
                                    <span className="text-sm font-medium text-gray-600">SUI</span>
                                  </div>
                                  <div className="text-xs text-gray-500 mt-1">
                                    {userProfile?.followerCount || 0} holders
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <Button 
                                    variant="outline"
                                    className="flex-1 h-10 rounded-xl font-medium border-gray-200 hover:bg-gray-50"
                                  >
                                    Follow
                                  </Button>
                                  <Button 
                                    onClick={() => followUser?.(post.author.id, post.author.id, userProfile?.followerCount || 0)}
                                    className="flex-1 h-10 rounded-xl font-medium bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white border-0"
                                  >
                                    Buy
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </HoverCardContent>
                        </HoverCard>
                      </div>
                    </div>

                    {/* More Options */}
                    <button className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Content */}
                  <div className="mb-4 text-gray-900 text-[15px] leading-relaxed">
                    {post.content}
                  </div>

                  {/* Interaction Bar - Right Aligned */}
                  <div className="flex items-center justify-end gap-1">
                    {/* Like Button */}
                    <button
                      onClick={() => handleLikePost(post.id)}
                      className={`
                        group flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all duration-200
                        ${isLiked 
                          ? 'text-pink-600 bg-pink-50 hover:bg-pink-100' 
                          : 'text-gray-600 hover:text-pink-600 hover:bg-gray-50'
                        }
                      `}
                    >
                      <Heart 
                        className={`w-4 h-4 transition-all duration-200 ${
                          isLiked ? 'fill-current scale-110' : 'group-hover:scale-110'
                        }`} 
                      />
                      <span className="text-sm font-medium">
                        {post.likes_count || 0}
                      </span>
                    </button>

                    {/* Comment Button */}
                    <button
                      className="group flex items-center gap-2 px-3 py-1.5 text-gray-600 hover:text-blue-600 hover:bg-gray-50 rounded-xl transition-all duration-200"
                    >
                      <MessageCircle className="w-4 h-4 group-hover:scale-110 transition-transform duration-200" />
                      <span className="text-sm font-medium">
                        {post.comments_count || 0}
                      </span>
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="followed" className="space-y-4">
          {getFollowedPosts().length === 0 ? (
            <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-100">
              <Users className="w-12 h-12 text-indigo-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-800 mb-2 font-['Inter',_'Roboto',_-apple-system,_BlinkMacSystemFont,_'SF_Pro_Text',_sans-serif]">Your feed is empty</h3>
              <p className="text-sm text-gray-600 font-['Inter',_'Roboto',_-apple-system,_BlinkMacSystemFont,_'SF_Pro_Text',_sans-serif]">
                Follow other users to see their posts here
              </p>
              {followingList.length > 0 && (
                <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-50 rounded-lg">
                  <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
                  <p className="text-xs text-indigo-700 font-medium">
                    Following {followingList.length} {followingList.length === 1 ? 'account' : 'accounts'}
                  </p>
                </div>
              )}
            </div>
          ) : (
            getFollowedPosts().map((post) => {
              const isLiked = likedPosts.has(post.id);
              const currentPrice = userProfile?.currentPrice ? Number(userProfile.currentPrice) / 1e9 : 0.001;
              
              return (
                <article key={post.id} className="bg-white rounded-xl p-6 transition-all duration-200 hover:shadow-md shadow-sm border border-gray-100 font-['Inter',_'Roboto',_-apple-system,_BlinkMacSystemFont,_'SF_Pro_Text',_sans-serif]">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-start gap-3">
                      <HoverCard openDelay={200} closeDelay={100}>
                        <HoverCardTrigger asChild>
                          <button className="focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-full">
                            <Avatar className="w-10 h-10 ring-2 ring-white shadow-sm cursor-pointer transition-transform hover:scale-105">
                              {post.author.avatar_url && (
                                <AvatarImage src={post.author.avatar_url} alt={post.author.display_name || post.author.username} />
                              )}
                              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-sm font-medium">
                                {getAvatarFallback(post.author.username)}
                              </AvatarFallback>
                            </Avatar>
                          </button>
                        </HoverCardTrigger>
                        <HoverCardContent 
                          side="bottom" 
                          align="start" 
                          className="w-72 p-0 border-0 shadow-xl rounded-2xl overflow-hidden"
                          sideOffset={8}
                        >
                          {/* Hover Card Content */}
                          <div className="bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 p-[1px]">
                            <div className="bg-white rounded-2xl p-5">
                              {/* User Info */}
                              <div className="flex items-center gap-3 mb-4">
                                <Avatar className="w-12 h-12 ring-2 ring-white shadow-md">
                                  {post.author.avatar_url && (
                                    <AvatarImage src={post.author.avatar_url} alt={post.author.display_name || post.author.username} />
                                  )}
                                  <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                                    {getAvatarFallback(post.author.username)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-gray-900 truncate">{post.author.display_name || post.author.username}</p>
                                  <p className="text-sm text-gray-500">@{post.author.username}</p>
                                </div>
                              </div>

                              {/* Token Price */}
                              <div className="bg-gray-50 rounded-xl p-3 mb-4">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs font-medium text-gray-600">Share Price</span>
                                  <span className="text-xs text-green-600">+12.5%</span>
                                </div>
                                <div className="flex items-baseline gap-1">
                                  <span className="text-2xl font-bold text-gray-900">
                                    {formatPrice(currentPrice)}
                                  </span>
                                  <span className="text-sm font-medium text-gray-600">SUI</span>
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                  {userProfile?.followerCount || 0} holders
                                </div>
                              </div>

                              {/* Action Buttons */}
                              <div className="flex gap-2">
                                <Button 
                                  variant="outline"
                                  className="flex-1 h-10 rounded-xl font-medium border-gray-200 hover:bg-gray-50"
                                >
                                  Following
                                </Button>
                                <Button 
                                  onClick={() => followUser?.(post.author.id, post.author.id, userProfile?.followerCount || 0)}
                                  className="flex-1 h-10 rounded-xl font-medium bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white border-0"
                                >
                                  Buy
                                </Button>
                              </div>
                            </div>
                          </div>
                        </HoverCardContent>
                      </HoverCard>

                      <div className="flex-1 min-w-0">
                        <HoverCard openDelay={200} closeDelay={100}>
                          <HoverCardTrigger asChild>
                            <button className="text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg px-1 -mx-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-gray-900 hover:underline">
                                  {post.author.display_name || post.author.username}
                                </span>
                                <span className="text-gray-500 text-sm">
                                  @{post.author.username}
                                </span>
                                <span className="text-gray-400 text-sm">·</span>
                                <span className="text-gray-500 text-sm">
                                  {formatTimeAgo(post.created_at)}
                                </span>
                              </div>
                            </button>
                          </HoverCardTrigger>
                          {/* Reuse the same hover card content */}
                          <HoverCardContent 
                            side="bottom" 
                            align="start" 
                            className="w-72 p-0 border-0 shadow-xl rounded-2xl overflow-hidden"
                            sideOffset={8}
                          >
                            <div className="bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 p-[1px]">
                              <div className="bg-white rounded-2xl p-5">
                                <div className="flex items-center gap-3 mb-4">
                                  <Avatar className="w-12 h-12 ring-2 ring-white shadow-md">
                                    {post.author.avatar_url && (
                                      <AvatarImage src={post.author.avatar_url} alt={post.author.display_name || post.author.username} />
                                    )}
                                    <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                                      {getAvatarFallback(post.author.username)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-gray-900 truncate">{post.author.display_name || post.author.username}</p>
                                    <p className="text-sm text-gray-500">@{post.author.username}</p>
                                  </div>
                                </div>
                                <div className="bg-gray-50 rounded-xl p-3 mb-4">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-medium text-gray-600">Share Price</span>
                                    <span className="text-xs text-green-600">+12.5%</span>
                                  </div>
                                  <div className="flex items-baseline gap-1">
                                    <span className="text-2xl font-bold text-gray-900">
                                      {formatPrice(currentPrice)}
                                    </span>
                                    <span className="text-sm font-medium text-gray-600">SUI</span>
                                  </div>
                                  <div className="text-xs text-gray-500 mt-1">
                                    {userProfile?.followerCount || 0} holders
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <Button 
                                    variant="outline"
                                    className="flex-1 h-10 rounded-xl font-medium border-gray-200 hover:bg-gray-50"
                                  >
                                    Following
                                  </Button>
                                  <Button 
                                    onClick={() => followUser?.(post.author.id, post.author.id, userProfile?.followerCount || 0)}
                                    className="flex-1 h-10 rounded-xl font-medium bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white border-0"
                                  >
                                    Buy
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </HoverCardContent>
                        </HoverCard>
                      </div>
                    </div>

                    {/* More Options */}
                    <button className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Content */}
                  <div className="mb-4 text-gray-900 text-[15px] leading-relaxed">
                    {post.content}
                  </div>

                  {/* Interaction Bar - Right Aligned */}
                  <div className="flex items-center justify-end gap-1">
                    {/* Like Button */}
                    <button
                      onClick={() => handleLikePost(post.id)}
                      className={`
                        group flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all duration-200
                        ${isLiked 
                          ? 'text-pink-600 bg-pink-50 hover:bg-pink-100' 
                          : 'text-gray-600 hover:text-pink-600 hover:bg-gray-50'
                        }
                      `}
                    >
                      <Heart 
                        className={`w-4 h-4 transition-all duration-200 ${
                          isLiked ? 'fill-current scale-110' : 'group-hover:scale-110'
                        }`} 
                      />
                      <span className="text-sm font-medium">
                        {post.likes_count || 0}
                      </span>
                    </button>

                    {/* Comment Button */}
                    <button
                      className="group flex items-center gap-2 px-3 py-1.5 text-gray-600 hover:text-blue-600 hover:bg-gray-50 rounded-xl transition-all duration-200"
                    >
                      <MessageCircle className="w-4 h-4 group-hover:scale-110 transition-transform duration-200" />
                      <span className="text-sm font-medium">
                        {post.comments_count || 0}
                      </span>
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};