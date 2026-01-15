import React, { useState, useEffect } from 'react';
import { Card } from './ui-simple/Card';
import { Button } from './ui-simple/Button';
import { Avatar, AvatarFallback, AvatarImage } from './ui-simple/Avatar';
import { Badge } from './ui-simple/Badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui-simple/Tabs';
import { Alert, AlertDescription } from './ui-simple/Alert';
import { 
  User, 
  Coins, 
  TrendingUp, 
  Users, 
  MessageCircle,
  Heart,
  Repeat2,
  Share,
  ArrowLeft,
  DollarSign,
  Sparkles
} from 'lucide-react';
import { FollowButton } from './FollowButton';
import { useSocialFollow } from '../hooks/useSocialFollow';

interface UserProfileProps {
  username: string;
  onBack?: () => void;
}

export const UserProfile: React.FC<UserProfileProps> = ({ username, onBack }) => {
  const { calculatePriceMist, formatMistToSui } = useSocialFollow();
  const [profileData, setProfileData] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUserProfile();
    fetchUserPosts();
  }, [username]);

  const fetchUserProfile = async () => {
    try {
      setLoading(true);
      // TODO: Replace with actual API call
      const mockProfile = {
        id: `user_${username}`,
        username: username,
        display_name: username.charAt(0).toUpperCase() + username.slice(1),
        avatar_url: null,
        bio: `Creator of innovative meme tokens. Building the future of social finance.`,
        location: 'Web3 Universe',
        website: `${username}.memeflow.io`,
        joinedDate: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
        followerCount: Math.floor(Math.random() * 10000),
        followingCount: Math.floor(Math.random() * 1000),
        tokensCreated: Math.floor(Math.random() * 10),
        totalPosts: Math.floor(Math.random() * 100),
        marketId: `market_${username}`, // Mock market ID
        currentSupply: Math.floor(Math.random() * 100), // Current follower count for pricing
      };
      setProfileData(mockProfile);
    } catch (err) {
      console.error('Failed to fetch user profile:', err);
      setError('Failed to load user profile');
    } finally {
      setLoading(false);
    }
  };

  const fetchUserPosts = async () => {
    try {
      // TODO: Replace with actual API call
      const mockPosts = Array.from({ length: 5 }, (_, i) => ({
        id: `post_${i}`,
        content: `This is an amazing post about meme tokens! Post #${i + 1} 🚀`,
        created_at: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
        likes_count: Math.floor(Math.random() * 100),
        comments_count: Math.floor(Math.random() * 50),
        reposts_count: Math.floor(Math.random() * 20),
      }));
      setPosts(mockPosts);
    } catch (err) {
      console.error('Failed to fetch user posts:', err);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h`;
    return `${Math.floor(diffInMinutes / 1440)}d`;
  };

  const formatNumber = (num: number) => {
    if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
    return num.toString();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Card className="bg-white border border-[#ECECEC] p-8 animate-pulse">
          <div className="flex items-start space-x-6">
            <div className="w-24 h-24 bg-gray-200 rounded-full"></div>
            <div className="flex-1 space-y-3">
              <div className="h-6 bg-gray-200 rounded w-1/3"></div>
              <div className="h-4 bg-gray-200 rounded w-2/3"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (error || !profileData) {
    return (
      <Card className="bg-white border border-red-200 p-8 text-center">
        <div className="text-red-600 mb-4">{error || 'User not found'}</div>
        {onBack && (
          <Button onClick={onBack} variant="outline" className="border-red-300 text-red-600 hover:bg-red-50">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
        )}
      </Card>
    );
  }

  const followPrice = calculatePriceMist(profileData.currentSupply + 1);
  const currentPrice = calculatePriceMist(profileData.currentSupply);

  return (
    <div className="space-y-6">
      {/* Header with Back Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          {onBack && (
            <Button onClick={onBack} variant="ghost" size="sm" className="text-gray-700 hover:text-blue-600">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          )}
          <h2 className="text-2xl font-bold text-gray-900">
            @{profileData.username}
          </h2>
        </div>
      </div>

      {/* Profile Header */}
      <Card className="bg-white border border-[#ECECEC] p-8 bg-gradient-to-r from-blue-50 via-purple-50 to-pink-50">
        <div className="flex items-start space-x-6">
          <Avatar className="w-24 h-24 border-2 border-gray-200">
            {profileData.avatar_url && (
              <AvatarImage src={profileData.avatar_url} alt={`@${profileData.username}`} />
            )}
            <AvatarFallback className="bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-white text-2xl font-bold">
              {profileData.username[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-3">
                <h1 className="text-2xl font-bold text-gray-900">{profileData.display_name}</h1>
                <Badge className="bg-gradient-to-r from-blue-500 to-purple-500 text-white">
                  Token Creator
                </Badge>
              </div>
              <FollowButton
                targetUserId={profileData.id}
                targetUsername={profileData.username}
                targetMarketId={profileData.marketId}
                targetSupply={profileData.currentSupply}
                showPrice={true}
              />
            </div>
            
            <p className="text-gray-700 mb-4 leading-relaxed">
              {profileData.bio}
            </p>
            
            <div className="flex items-center space-x-6 text-sm text-gray-600 mb-4">
              <div>📍 {profileData.location}</div>
              <div>🌐 {profileData.website}</div>
              <div>📅 Joined {formatTimeAgo(profileData.joinedDate)}</div>
            </div>
            
            <div className="flex items-center space-x-8">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">{formatNumber(profileData.totalPosts)}</div>
                <div className="text-gray-600 text-sm">Posts</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{profileData.tokensCreated}</div>
                <div className="text-gray-600 text-sm">Tokens</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{formatNumber(profileData.followerCount)}</div>
                <div className="text-gray-600 text-sm">Followers</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-pink-600">{formatNumber(profileData.followingCount)}</div>
                <div className="text-gray-600 text-sm">Following</div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Bonding Curve Info */}
      <Card className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center">
              <TrendingUp className="w-5 h-5 mr-2 text-purple-600" />
              Follow Economics
            </h3>
            <p className="text-gray-700 text-sm">
              Following uses a bonding curve model. Early followers pay less!
            </p>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-600 mb-1">Current Follow Price</div>
            <div className="text-2xl font-bold text-purple-600 flex items-center justify-end">
              <DollarSign className="w-5 h-5" />
              {formatMistToSui(followPrice)} SUI
            </div>
            {currentPrice > BigInt(0) && (
              <div className="text-xs text-gray-500 mt-1">
                Next: {formatMistToSui(calculatePriceMist(profileData.currentSupply + 2))} SUI
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Recent Posts */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
          <MessageCircle className="w-5 h-5 mr-2 text-blue-600" />
          Recent Posts
        </h3>
        
        {posts.length > 0 ? (
          posts.map((post) => (
            <Card key={post.id} className="bg-white border border-[#ECECEC] p-6 hover:border-gray-300 transition-all">
              <div className="flex space-x-4">
                <Avatar className="w-10 h-10 border border-gray-200">
                  {profileData.avatar_url && (
                    <AvatarImage src={profileData.avatar_url} alt={`@${profileData.username}`} />
                  )}
                  <AvatarFallback className="bg-gradient-to-r from-blue-500 to-purple-500 text-white text-sm font-bold">
                    {profileData.username[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="font-semibold text-gray-900">@{profileData.username}</span>
                    <span className="text-gray-500 text-sm">·</span>
                    <span className="text-gray-500 text-sm">{formatTimeAgo(post.created_at)}</span>
                  </div>
                  <p className="text-gray-800 mb-3">{post.content}</p>
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
                  </div>
                </div>
              </div>
            </Card>
          ))
        ) : (
          <Card className="bg-white border border-[#ECECEC] p-8 text-center">
            <MessageCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600">No posts yet</p>
          </Card>
        )}
      </div>
    </div>
  );
};