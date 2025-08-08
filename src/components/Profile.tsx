import React, { useState, useEffect } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Avatar } from './ui/avatar';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { User, Coins, TrendingUp, Users, Edit, Settings, LogOut } from 'lucide-react';
import { useAuth } from './AuthProvider';

interface ProfileProps {
  user: any;
}

export const Profile: React.FC<ProfileProps> = ({ user }) => {
  const { signOut } = useAuth();
  const [profileData, setProfileData] = useState<any>({});
  const [userTokens, setUserTokens] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [following, setFollowing] = useState<any[]>([]);
  const [followers, setFollowers] = useState<any[]>([]);

  useEffect(() => {
    fetchProfileData();
    fetchUserTokens();
    fetchUserPosts();
    fetchSocialData();
  }, [user]);

  const fetchProfileData = async () => {
    try {
      // Mock profile data - replace with real API
      const mockProfile = {
        totalPosts: 23,
        tokensCreated: 1,
        followers: 156,
        following: 89,
        joinedDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(), // 30 days ago
        bio: 'Meme enthusiast and token creator 🚀 Building the future of social trading',
        location: 'Metaverse',
        website: 'https://memeflow.io',
        totalEarnings: 0.024, // SUI
        bestPerforming: 'MEME (+150%)'
      };
      setProfileData(mockProfile);
    } catch (error) {
      console.error('Failed to fetch profile:', error);
    }
  };

  const fetchUserTokens = async () => {
    try {
      // Mock user tokens - replace with real API
      const mockTokens = [
        {
          id: '1',
          symbol: user.username?.toUpperCase() || 'USER',
          name: `${user.username}Token`,
          price: 0.0012,
          change24h: +15.3,
          marketCap: 1200000,
          holders: 342,
          created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString()
        }
      ];
      setUserTokens(mockTokens);
    } catch (error) {
      console.error('Failed to fetch user tokens:', error);
    }
  };

  const fetchUserPosts = async () => {
    try {
      // Mock user posts - replace with real API
      const mockPosts = [
        {
          id: '1',
          content: 'Just launched my personal token! 🚀 Who wants to join the journey?',
          created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
          likes: 42,
          comments: 12
        },
        {
          id: '2',
          content: 'Market analysis: The meme sector is looking bullish this week! 📈',
          created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
          likes: 28,
          comments: 8
        },
        {
          id: '3',
          content: 'Thanks to everyone who supported my token launch! Community is everything 🙏',
          created_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
          likes: 67,
          comments: 23
        }
      ];
      setPosts(mockPosts);
    } catch (error) {
      console.error('Failed to fetch user posts:', error);
    }
  };

  const fetchSocialData = async () => {
    try {
      // Mock social data - replace with real API
      const mockFollowers = [
        { id: '1', username: 'cryptokid', avatar: null },
        { id: '2', username: 'moonlambo', avatar: null },
        { id: '3', username: 'memequeen', avatar: null }
      ];
      const mockFollowing = [
        { id: '4', username: 'pepemaster', avatar: null },
        { id: '5', username: 'dogeking', avatar: null }
      ];
      setFollowers(mockFollowers);
      setFollowing(mockFollowing);
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
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-transparent bg-gradient-to-r from-cyan-400 via-pink-400 to-purple-400 bg-clip-text">
          Profile
        </h2>
        <div className="flex items-center space-x-2">
          <Button variant="ghost" size="sm" className="text-white hover:text-cyan-300">
            <Edit className="w-4 h-4 mr-2" />
            Edit
          </Button>
          <Button variant="ghost" size="sm" className="text-white hover:text-cyan-300">
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Profile Header */}
      <Card className="glass border border-white/10 p-8 bg-gradient-to-r from-purple-500/10 via-pink-500/10 to-cyan-500/10">
        <div className="flex items-start space-x-6">
          <Avatar className="w-24 h-24 bg-gradient-to-r from-cyan-400 via-pink-400 to-purple-400 flex items-center justify-center text-2xl">
            <span className="text-white font-bold">
              {user.username ? user.username[0].toUpperCase() : 'U'}
            </span>
          </Avatar>
          
          <div className="flex-1">
            <div className="flex items-center space-x-3 mb-2">
              <h1 className="text-2xl font-bold text-white">@{user.username}</h1>
              <Badge className="bg-gradient-to-r from-cyan-500 to-pink-500 text-white">
                Token Creator
              </Badge>
            </div>
            
            <p className="text-white/80 mb-4 leading-relaxed">
              {profileData.bio || 'Meme enthusiast and blockchain explorer 🚀'}
            </p>
            
            <div className="flex items-center space-x-6 text-sm text-white/60 mb-4">
              <div>📍 {profileData.location || 'Metaverse'}</div>
              <div>🌐 {profileData.website || 'memeflow.io'}</div>
              <div>📅 Joined {formatTimeAgo(profileData.joinedDate || user.created_at)}</div>
            </div>
            
            <div className="flex items-center space-x-8">
              <div className="text-center">
                <div className="text-2xl font-bold text-white">{profileData.totalPosts || 0}</div>
                <div className="text-white/60 text-sm">Posts</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-cyan-400">{profileData.tokensCreated || 0}</div>
                <div className="text-white/60 text-sm">Tokens</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-pink-400">{profileData.followers || 0}</div>
                <div className="text-white/60 text-sm">Followers</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-400">{profileData.following || 0}</div>
                <div className="text-white/60 text-sm">Following</div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Stats Cards */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="glass border border-white/10 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white flex items-center">
              <Coins className="w-5 h-5 mr-2 text-cyan-400" />
              Token Performance
            </h3>
          </div>
          
          {userTokens.length > 0 ? (
            <div className="space-y-4">
              {userTokens.map((token) => (
                <div key={token.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                  <div>
                    <div className="font-semibold text-white">${token.symbol}</div>
                    <div className="text-sm text-white/60">{formatNumber(token.holders)} holders</div>
                  </div>
                  <div className="text-right">
                    <div className="text-white">${token.price.toFixed(4)}</div>
                    <div className={`text-sm ${token.change24h > 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {token.change24h > 0 ? '+' : ''}{token.change24h.toFixed(1)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Coins className="w-12 h-12 text-white/30 mx-auto mb-3" />
              <p className="text-white/60">No tokens created yet</p>
            </div>
          )}
        </Card>

        <Card className="glass border border-white/10 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white flex items-center">
              <TrendingUp className="w-5 h-5 mr-2 text-green-400" />
              Earnings
            </h3>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-white/70">Total Earnings</span>
              <span className="text-white font-semibold">{profileData.totalEarnings?.toFixed(4) || '0.0000'} SUI</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/70">Best Performer</span>
              <span className="text-green-400 font-semibold">{profileData.bestPerforming || 'N/A'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/70">Active Tokens</span>
              <span className="text-cyan-400 font-semibold">{userTokens.length}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="posts" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 bg-white/5">
          <TabsTrigger value="posts" className="text-white data-[state=active]:bg-cyan-500/20">
            Posts
          </TabsTrigger>
          <TabsTrigger value="tokens" className="text-white data-[state=active]:bg-pink-500/20">
            Tokens
          </TabsTrigger>
          <TabsTrigger value="social" className="text-white data-[state=active]:bg-purple-500/20">
            Social
          </TabsTrigger>
        </TabsList>

        <TabsContent value="posts" className="space-y-4">
          {posts.length > 0 ? (
            <div className="space-y-4">
              {posts.map((post) => (
                <Card key={post.id} className="glass border border-white/10 p-6">
                  <div className="flex space-x-4">
                    <Avatar className="w-10 h-10 bg-gradient-to-r from-cyan-400 to-purple-400 flex items-center justify-center">
                      <span className="text-white font-bold text-sm">
                        {user.username[0].toUpperCase()}
                      </span>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="font-semibold text-white">@{user.username}</span>
                        <span className="text-white/50 text-sm">·</span>
                        <span className="text-white/50 text-sm">{formatTimeAgo(post.created_at)}</span>
                      </div>
                      <p className="text-white/90 mb-3">{post.content}</p>
                      <div className="flex items-center space-x-4 text-white/60 text-sm">
                        <span>❤️ {post.likes}</span>
                        <span>💬 {post.comments}</span>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="glass border border-white/10 p-12 text-center">
              <User className="w-16 h-16 text-white/30 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white/70 mb-2">No posts yet</h3>
              <p className="text-white/50">Start sharing your thoughts with the community!</p>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="tokens" className="space-y-4">
          {userTokens.length > 0 ? (
            <div className="grid gap-4">
              {userTokens.map((token) => (
                <Card key={token.id} className="glass border border-pink-500/30 p-6 bg-gradient-to-r from-pink-500/10 to-purple-500/10">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-gradient-to-r from-pink-400 to-purple-400 rounded-full flex items-center justify-center">
                        <span className="text-white font-bold text-sm">{token.symbol.slice(0, 3)}</span>
                      </div>
                      <div>
                        <h3 className="font-semibold text-white">${token.symbol}</h3>
                        <p className="text-white/60 text-sm">Created {formatTimeAgo(token.created_at)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-white font-semibold">${token.price.toFixed(4)}</div>
                      <div className="text-white/70 text-sm">{formatNumber(token.marketCap)} MCap</div>
                      <div className="text-white/60 text-sm">{token.holders} holders</div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="glass border border-white/10 p-12 text-center">
              <Coins className="w-16 h-16 text-white/30 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white/70 mb-2">No tokens created</h3>
              <p className="text-white/50 mb-4">Your first token is automatically created when you join!</p>
              <Button className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600">
                Create Token
              </Button>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="social" className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="glass border border-white/10 p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                <Users className="w-5 h-5 mr-2 text-cyan-400" />
                Following ({following.length})
              </h3>
              <div className="space-y-3">
                {following.slice(0, 5).map((user) => (
                  <div key={user.id} className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Avatar className="w-8 h-8 bg-gradient-to-r from-cyan-400 to-purple-400 flex items-center justify-center">
                        <span className="text-white font-bold text-xs">{user.username[0].toUpperCase()}</span>
                      </Avatar>
                      <span className="text-white">@{user.username}</span>
                    </div>
                    <Button variant="ghost" size="sm" className="text-cyan-400 hover:text-cyan-300">
                      Following
                    </Button>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="glass border border-white/10 p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                <Users className="w-5 h-5 mr-2 text-pink-400" />
                Followers ({followers.length})
              </h3>
              <div className="space-y-3">
                {followers.slice(0, 5).map((user) => (
                  <div key={user.id} className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Avatar className="w-8 h-8 bg-gradient-to-r from-pink-400 to-purple-400 flex items-center justify-center">
                        <span className="text-white font-bold text-xs">{user.username[0].toUpperCase()}</span>
                      </Avatar>
                      <span className="text-white">@{user.username}</span>
                    </div>
                    <Button variant="ghost" size="sm" className="text-pink-400 hover:text-pink-300">
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
      <Card className="glass border border-red-500/30 p-6 bg-red-500/10">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white mb-1">Sign Out</h3>
            <p className="text-white/60">You'll need to sign back in to access your account</p>
          </div>
          <Button
            onClick={signOut}
            variant="outline"
            className="border-red-500 text-red-400 hover:bg-red-500/20"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </Card>
    </div>
  );
};