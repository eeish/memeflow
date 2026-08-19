import React, { useState, useEffect } from 'react';
import { SocialFeed } from './SocialFeed';
import { Globe, Heart, MessageCircle, Repeat2, Send, AlertCircle, Flame, Users, Star, Share, TrendingUp } from 'lucide-react';
import { Card } from './ui/card';
import { Avatar, AvatarImage, AvatarFallback } from './ui/avatar';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { Alert, AlertDescription } from './ui/alert';
import { FollowButton } from './FollowButton';

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
    const diffInMinutes = Math.floor((now.getTime() - postDate.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h`;
    return `${Math.floor(diffInMinutes / 1440)}d`;
  };

  const getAvatarFallback = (username: string) => {
    return username.charAt(0).toUpperCase();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Globe className="w-6 h-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">
              Plaza
            </h1>
          </div>
        </div>
        
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
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Globe className="w-6 h-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">
              Plaza
            </h1>
          </div>
        </div>
        
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
      {/* Plaza Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Globe className="w-6 h-6 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Plaza
            </h1>
            <p className="text-sm text-gray-600">Global meme token community feed</p>
          </div>
        </div>
      </div>


      {/* Error Alert */}
      {error && (
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="w-4 h-4 text-red-600" />
          <AlertDescription className="text-red-700">{error}</AlertDescription>
        </Alert>
      )}

      {/* Create Post - Twitter-like Composition */}
      {user && (
        <Card className="bg-white border border-[#ECECEC] p-6">
          <div className="flex space-x-4">
            <Avatar className="w-12 h-12 border border-gray-200">
              {(user.avatar_url || user.avatar) && (
                <AvatarImage src={user.avatar_url || user.avatar} alt={`@${user.username}`} />
              )}
              <AvatarFallback className="bg-gradient-to-r from-blue-500 to-purple-500 text-white font-bold">
                {user.username ? user.username[0].toUpperCase() : 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <Textarea
                placeholder="What's happening in the meme universe? 🚀"
                value={newPost}
                onChange={(e) => setNewPost(e.target.value)}
                className="bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-500 min-h-[120px] resize-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                maxLength={280}
              />
              <div className="flex items-center justify-between mt-4">
                <div className="flex items-center space-x-4">
                  <span className="text-sm text-gray-600">
                    {280 - newPost.length} characters remaining
                  </span>
                  {user.username && (
                    <Badge variant="outline" className="text-xs bg-blue-50 border-blue-200 text-blue-700">
                      Posted as @{user.username}
                    </Badge>
                  )}
                </div>
                <Button
                  onClick={handleCreatePost}
                  disabled={!newPost.trim() || posting || !user?.id}
                  className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-semibold px-6"
                >
                  <Send className="w-4 h-4 mr-2" />
                  {posting ? 'Posting...' : 'Post to Plaza'}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Tabbed Posts Feed */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 bg-gray-100">
          <TabsTrigger value="ranked" className="text-gray-700 data-[state=active]:bg-orange-500 data-[state=active]:text-white">
            <Flame className="w-4 h-4 mr-2" />
            Ranked
          </TabsTrigger>
          <TabsTrigger value="followed" className="text-gray-700 data-[state=active]:bg-blue-500 data-[state=active]:text-white">
            <Users className="w-4 h-4 mr-2" />
            Followed
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ranked" className="space-y-4">
          {getRankedPosts().length === 0 ? (
            <Card className="bg-white border border-[#ECECEC] p-8 text-center">
              <Flame className="w-12 h-12 text-orange-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Trending Content</h3>
              <p className="text-gray-600">
                Discover the hottest posts ranked by engagement and trending metrics. Posts appear here when the community is active.
              </p>
            </Card>
          ) : (
            getRankedPosts().map((post) => (
              <Card key={post.id} className="bg-white border border-[#ECECEC] p-6 hover:border-gray-300 transition-all duration-300 relative">
                {/* Ranking Badge */}
                <div className="absolute top-4 right-4">
                  <Badge variant="outline" className="text-xs bg-orange-50 border-orange-200 text-orange-700">
                    <Star className="w-3 h-3 mr-1" />
                    Trending
                  </Badge>
                </div>
                
                {/* Post Header */}
                <div className="flex items-start space-x-4">
                  <Avatar className="w-10 h-10 border border-gray-200">
                    {post.author.avatar_url && (
                      <AvatarImage src={post.author.avatar_url} alt={`@${post.author.username}`} />
                    )}
                    <AvatarFallback className="bg-gradient-to-r from-blue-500 to-purple-500 text-white font-bold">
                      {getAvatarFallback(post.author.username)}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-gray-900">{post.author.display_name || post.author.username}</span>
                        <span className="text-gray-500">@{post.author.username}</span>
                        <Badge variant="outline" className="text-xs bg-blue-50 border-blue-200 text-blue-700">
                          ${post.author.token_symbol}
                        </Badge>
                        <span className="text-gray-400 text-sm">·</span>
                        <span className="text-gray-400 text-sm">{formatTimeAgo(post.created_at)}</span>
                      </div>
                      {post.author.username !== user?.username && (
                        <FollowButton
                          targetUserId={post.author.id}
                          targetUsername={post.author.username}
                          targetMarketId={post.author.id} // Using author ID as placeholder for market ID
                          targetSupply={0} // Would fetch actual follower count
                          size="sm"
                          showPrice={false}
                        />
                      )}
                    </div>
                    
                    {/* Post Content */}
                    <div className="text-gray-800 leading-relaxed mb-4">
                      {post.content}
                    </div>
                    
                    {/* Post Actions */}
                    <div className="flex items-center space-x-6 text-gray-500">
                      <Button variant="ghost" size="sm" className="flex items-center space-x-2 hover:text-pink-600 hover:bg-pink-50">
                        <Heart className="w-4 h-4" />
                        <span className="text-sm">{post.likes_count}</span>
                      </Button>
                      
                      <Button variant="ghost" size="sm" className="flex items-center space-x-2 hover:text-blue-600 hover:bg-blue-50">
                        <MessageCircle className="w-4 h-4" />
                        <span className="text-sm">{post.comments_count}</span>
                      </Button>
                      
                      <Button variant="ghost" size="sm" className="flex items-center space-x-2 hover:text-green-600 hover:bg-green-50">
                        <Repeat2 className="w-4 h-4" />
                        <span className="text-sm">{post.reposts_count}</span>
                      </Button>
                      
                      <Button variant="ghost" size="sm" className="flex items-center space-x-2 hover:text-blue-600 hover:bg-blue-50">
                        <Share className="w-4 h-4" />
                      </Button>
                      
                      {/* Token Performance Indicator */}
                      <div className="ml-auto flex items-center space-x-1 text-green-600">
                        <TrendingUp className="w-3 h-3" />
                        <span className="text-xs">+5.2%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="followed" className="space-y-4">
          {getFollowedPosts().length === 0 ? (
            <Card className="bg-white border border-[#ECECEC] p-8 text-center">
              <Users className="w-12 h-12 text-blue-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Following Feed</h3>
              <p className="text-gray-600 mb-4">
                Posts from accounts you follow will appear here. Start following other users to see their content!
              </p>
              <p className="text-gray-500 text-sm">
                You're following {followingList.length} accounts
              </p>
            </Card>
          ) : (
            getFollowedPosts().map((post) => (
              <Card key={post.id} className="bg-white border border-[#ECECEC] p-6 hover:border-gray-300 transition-all duration-300 relative">
                {/* Following Badge */}
                <div className="absolute top-4 right-4">
                  <Badge variant="outline" className="text-xs bg-blue-50 border-blue-200 text-blue-700">
                    <Users className="w-3 h-3 mr-1" />
                    Following
                  </Badge>
                </div>
                
                {/* Post Header */}
                <div className="flex items-start space-x-4">
                  <Avatar className="w-10 h-10 border border-gray-200">
                    {post.author.avatar_url && (
                      <AvatarImage src={post.author.avatar_url} alt={`@${post.author.username}`} />
                    )}
                    <AvatarFallback className="bg-gradient-to-r from-blue-500 to-purple-500 text-white font-bold">
                      {getAvatarFallback(post.author.username)}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-gray-900">{post.author.display_name || post.author.username}</span>
                        <span className="text-gray-500">@{post.author.username}</span>
                        <Badge variant="outline" className="text-xs bg-blue-50 border-blue-200 text-blue-700">
                          ${post.author.token_symbol}
                        </Badge>
                        <span className="text-gray-400 text-sm">·</span>
                        <span className="text-gray-400 text-sm">{formatTimeAgo(post.created_at)}</span>
                      </div>
                      {post.author.username !== user?.username && (
                        <FollowButton
                          targetUserId={post.author.id}
                          targetUsername={post.author.username}
                          targetMarketId={post.author.id} // Using author ID as placeholder for market ID
                          targetSupply={0} // Would fetch actual follower count
                          size="sm"
                          showPrice={false}
                        />
                      )}
                    </div>
                    
                    {/* Post Content */}
                    <div className="text-gray-800 leading-relaxed mb-4">
                      {post.content}
                    </div>
                    
                    {/* Post Actions */}
                    <div className="flex items-center space-x-6 text-gray-500">
                      <Button variant="ghost" size="sm" className="flex items-center space-x-2 hover:text-pink-600 hover:bg-pink-50">
                        <Heart className="w-4 h-4" />
                        <span className="text-sm">{post.likes_count}</span>
                      </Button>
                      
                      <Button variant="ghost" size="sm" className="flex items-center space-x-2 hover:text-blue-600 hover:bg-blue-50">
                        <MessageCircle className="w-4 h-4" />
                        <span className="text-sm">{post.comments_count}</span>
                      </Button>
                      
                      <Button variant="ghost" size="sm" className="flex items-center space-x-2 hover:text-green-600 hover:bg-green-50">
                        <Repeat2 className="w-4 h-4" />
                        <span className="text-sm">{post.reposts_count}</span>
                      </Button>
                      
                      <Button variant="ghost" size="sm" className="flex items-center space-x-2 hover:text-blue-600 hover:bg-blue-50">
                        <Share className="w-4 h-4" />
                      </Button>
                      
                      {/* Token Performance Indicator */}
                      <div className="ml-auto flex items-center space-x-1 text-green-600">
                        <TrendingUp className="w-3 h-3" />
                        <span className="text-xs">+5.2%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
      
    </div>
  );
};