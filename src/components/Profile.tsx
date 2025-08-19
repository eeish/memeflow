import React, { useState, useEffect } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { User, Coins, TrendingUp, Users, Edit, Settings, LogOut, UserPlus, DollarSign } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { useSocialFollow } from '../hooks/useSocialFollow';
import { FollowButton } from './FollowButton';
import { useSuiClient } from '@mysten/dapp-kit';
import { useNetwork } from '../contexts/NetworkContext';
import { NetworkWarning } from './NetworkWarning';

interface ProfileProps {
  user: any;
}

export const Profile: React.FC<ProfileProps> = ({ user }) => {
  const { signOut } = useAuth();
  const { userProfile, followingList, createProfile, error: socialError } = useSocialFollow();
  const client = useSuiClient();
  const { currentNetwork } = useNetwork();
  const [profileData, setProfileData] = useState<any>({});
  const [userTokens, setUserTokens] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [following, setFollowing] = useState<any[]>([]);
  const [followers, setFollowers] = useState<any[]>([]);
  const [showCreateProfile, setShowCreateProfile] = useState(false);
  
  // Log network info for debugging
  useEffect(() => {
    console.log('Profile - Current network:', currentNetwork);
    console.log('Profile - RPC URL:', client.url);
  }, [currentNetwork, client]);

  useEffect(() => {
    fetchProfileData();
    fetchUserTokens();
    fetchUserPosts();
    fetchSocialData();
  }, [user]);

  const fetchProfileData = async () => {
    try {
      // TODO: Implement real API call to fetch profile data
      // Set default/empty values for now
      const defaultProfile = {
        totalPosts: 0,
        tokensCreated: 0,
        followers: 0,
        following: 0,
        joinedDate: user.created_at || new Date().toISOString(),
        bio: '',
        location: '',
        website: '',
        totalEarnings: 0,
        bestPerforming: 'N/A'
      };
      setProfileData(defaultProfile);
    } catch (error) {
      console.error('Failed to fetch profile:', error);
    }
  };

  const fetchUserTokens = async () => {
    try {
      // TODO: Implement real API call to fetch user tokens
      // Start with empty array for now
      setUserTokens([]);
    } catch (error) {
      console.error('Failed to fetch user tokens:', error);
    }
  };

  const fetchUserPosts = async () => {
    try {
      // TODO: Implement real API call to fetch user posts
      // Start with empty array for now
      setPosts([]);
    } catch (error) {
      console.error('Failed to fetch user posts:', error);
    }
  };

  const fetchSocialData = async () => {
    try {
      // TODO: Implement real API calls to fetch followers and following
      // Start with empty arrays for now
      setFollowers([]);
      setFollowing([]);
    } catch (error) {
      console.error('Failed to fetch social data:', error);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffInDays === 0) return 'Today';
    if (diffInDays === 1) return '1 day ago';
    return `${diffInDays} days ago`;
  };

  const formatNumber = (num: number) => {
    if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
    return num.toString();
  };

  return (
    <div className="space-y-6">
      {/* Network Warning */}
      <NetworkWarning />
      
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">
          Profile
        </h2>
        <div className="flex items-center space-x-2">
          <Button variant="ghost" size="sm" className="text-gray-700 hover:text-blue-600">
            <Edit className="w-4 h-4 mr-2" />
            Edit
          </Button>
          <Button variant="ghost" size="sm" className="text-gray-700 hover:text-blue-600">
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Create Profile CTA if no social profile */}
      {!userProfile && (
        <Card className="bg-gradient-to-r from-blue-500 to-purple-500 p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold mb-2">Create Your Social Profile</h3>
              <p className="text-blue-100">Set up your social profile to follow others and build your community with bonding curve economics!</p>
              {socialError && (
                <div className="mt-2 p-2 bg-red-500/20 rounded text-xs text-red-100">
                  ⚠️ {socialError}
                </div>
              )}
              <div className="mt-2 text-xs text-blue-200">
                Network: {currentNetwork}
              </div>
            </div>
            <Button
              onClick={() => createProfile(user.username, 'Meme enthusiast', user.avatar_url || '')}
              className="bg-white text-blue-600 hover:bg-gray-100"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Create Profile
            </Button>
          </div>
          {userProfile?.sponsorLeft && userProfile.sponsorLeft > 0 && (
            <Badge className="mt-3 bg-yellow-400 text-yellow-900">
              🎁 {userProfile.sponsorLeft} free follows available!
            </Badge>
          )}
        </Card>
      )}

      {/* Profile Header */}
      <Card className="bg-white border border-[#ECECEC] p-8 bg-gradient-to-r from-purple-50 via-pink-50 to-blue-50">
        <div className="flex items-start space-x-6">
          <Avatar className="w-24 h-24 border-2 border-gray-200">
            {user.avatar_url && (
              <AvatarImage src={user.avatar_url} alt={`@${user.username}`} />
            )}
            <AvatarFallback className="bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-white text-2xl font-bold">
              {user.username ? user.username[0].toUpperCase() : 'U'}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1">
            <div className="flex items-center space-x-3 mb-2">
              <h1 className="text-2xl font-bold text-gray-900">@{user.username}</h1>
              <Badge className="bg-gradient-to-r from-blue-500 to-purple-500 text-white">
                Token Creator
              </Badge>
            </div>
            
            <p className="text-gray-700 mb-4 leading-relaxed">
              {profileData.bio || 'Meme enthusiast and blockchain explorer 🚀'}
            </p>
            
            <div className="flex items-center space-x-6 text-sm text-gray-600 mb-4">
              <div>📍 {profileData.location || 'Metaverse'}</div>
              <div>🌐 {profileData.website || 'memeflow.io'}</div>
              <div>📅 Joined {formatTimeAgo(profileData.joinedDate || user.created_at)}</div>
            </div>
            
            <div className="flex items-center space-x-8">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">{profileData.totalPosts || 0}</div>
                <div className="text-gray-600 text-sm">Posts</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{profileData.tokensCreated || 0}</div>
                <div className="text-gray-600 text-sm">Tokens</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{userProfile?.followerCount || profileData.followers || 0}</div>
                <div className="text-gray-600 text-sm">Followers</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-pink-600">{userProfile?.followingCount || followingList.length || profileData.following || 0}</div>
                <div className="text-gray-600 text-sm">Following</div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Stats Cards */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="bg-white border border-[#ECECEC] p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <Coins className="w-5 h-5 mr-2 text-blue-600" />
              Token Performance
            </h3>
          </div>
          
          {userTokens.length > 0 ? (
            <div className="space-y-4">
              {userTokens.map((token) => (
                <div key={token.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                  <div>
                    <div className="font-semibold text-gray-900">${token.symbol}</div>
                    <div className="text-sm text-gray-600">{formatNumber(token.holders)} holders</div>
                  </div>
                  <div className="text-right">
                    <div className="text-gray-900">${token.price.toFixed(4)}</div>
                    <div className={`text-sm ${token.change24h > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {token.change24h > 0 ? '+' : ''}{token.change24h.toFixed(1)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Coins className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600">No tokens created yet</p>
            </div>
          )}
        </Card>

        <Card className="bg-white border border-[#ECECEC] p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <TrendingUp className="w-5 h-5 mr-2 text-green-600" />
              Earnings
            </h3>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Total Earnings</span>
              <span className="text-gray-900 font-semibold">{profileData.totalEarnings?.toFixed(4) || '0.0000'} SUI</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Best Performer</span>
              <span className="text-green-600 font-semibold">{profileData.bestPerforming || 'N/A'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Active Tokens</span>
              <span className="text-blue-600 font-semibold">{userTokens.length}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="posts" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 bg-gray-100">
          <TabsTrigger value="posts" className="text-gray-700 data-[state=active]:bg-blue-500 data-[state=active]:text-white">
            Posts
          </TabsTrigger>
          <TabsTrigger value="tokens" className="text-gray-700 data-[state=active]:bg-purple-500 data-[state=active]:text-white">
            Tokens
          </TabsTrigger>
          <TabsTrigger value="social" className="text-gray-700 data-[state=active]:bg-green-500 data-[state=active]:text-white">
            Social
          </TabsTrigger>
        </TabsList>

        <TabsContent value="posts" className="space-y-4">
          {posts.length > 0 ? (
            <div className="space-y-4">
              {posts.map((post) => (
                <Card key={post.id} className="bg-white border border-[#ECECEC] p-6">
                  <div className="flex space-x-4">
                    <Avatar className="w-10 h-10 border border-gray-200">
                      {user.avatar_url && (
                        <AvatarImage src={user.avatar_url} alt={`@${user.username}`} />
                      )}
                      <AvatarFallback className="bg-gradient-to-r from-blue-500 to-purple-500 text-white text-sm font-bold">
                        {user.username[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="font-semibold text-gray-900">@{user.username}</span>
                        <span className="text-gray-500 text-sm">·</span>
                        <span className="text-gray-500 text-sm">{formatTimeAgo(post.created_at)}</span>
                      </div>
                      <p className="text-gray-800 mb-3">{post.content}</p>
                      <div className="flex items-center space-x-4 text-gray-600 text-sm">
                        <span>❤️ {post.likes}</span>
                        <span>💬 {post.comments}</span>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="bg-white border border-[#ECECEC] p-12 text-center">
              <User className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-700 mb-2">No posts yet</h3>
              <p className="text-gray-600">Start sharing your thoughts with the community!</p>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="tokens" className="space-y-4">
          {userTokens.length > 0 ? (
            <div className="grid gap-4">
              {userTokens.map((token) => (
                <Card key={token.id} className="bg-white border border-purple-200 p-6 bg-gradient-to-r from-purple-50 to-pink-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                        <span className="text-white font-bold text-sm">{token.symbol.slice(0, 3)}</span>
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">${token.symbol}</h3>
                        <p className="text-gray-600 text-sm">Created {formatTimeAgo(token.created_at)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-gray-900 font-semibold">${token.price.toFixed(4)}</div>
                      <div className="text-gray-700 text-sm">{formatNumber(token.marketCap)} MCap</div>
                      <div className="text-gray-600 text-sm">{token.holders} holders</div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="bg-white border border-[#ECECEC] p-12 text-center">
              <Coins className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-700 mb-2">No tokens created</h3>
              <p className="text-gray-600 mb-4">Your first token is automatically created when you join!</p>
              <Button className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600">
                Create Token
              </Button>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="social" className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="bg-white border border-[#ECECEC] p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <Users className="w-5 h-5 mr-2 text-blue-600" />
                Following ({following.length})
              </h3>
              <div className="space-y-3">
                {following.slice(0, 5).map((user) => (
                  <div key={user.id} className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Avatar className="w-8 h-8 border border-gray-200">
                        <AvatarFallback className="bg-gradient-to-r from-blue-500 to-purple-500 text-white text-xs font-bold">
                          {user.username[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-gray-900">@{user.username}</span>
                    </div>
                    <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700">
                      Following
                    </Button>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="bg-white border border-[#ECECEC] p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <Users className="w-5 h-5 mr-2 text-purple-600" />
                Followers ({followers.length})
              </h3>
              <div className="space-y-3">
                {followers.slice(0, 5).map((user) => (
                  <div key={user.id} className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Avatar className="w-8 h-8 border border-gray-200">
                        <AvatarFallback className="bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-bold">
                          {user.username[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-gray-900">@{user.username}</span>
                    </div>
                    <Button variant="ghost" size="sm" className="text-purple-600 hover:text-purple-700">
                      Follow
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Sign Out */}
      <Card className="bg-white border border-red-200 p-6 bg-red-50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Sign Out</h3>
            <p className="text-gray-600">You'll need to sign back in to access your account</p>
          </div>
          <Button
            onClick={signOut}
            variant="outline"
            className="border-red-500 text-red-600 hover:bg-red-100"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </Card>
    </div>
  );
};