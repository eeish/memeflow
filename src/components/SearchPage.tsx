import React, { useState, useEffect } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Avatar } from './ui/avatar';
import { Badge } from './ui/badge';
import { Search, X, TrendingUp, Users, Hash } from 'lucide-react';

interface SearchPageProps {
  user: any;
}

export const SearchPage: React.FC<SearchPageProps> = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any>({
    tokens: [],
    users: [],
    hashtags: []
  });
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    if (searchQuery.trim()) {
      performSearch(searchQuery);
    } else {
      setSearchResults({ tokens: [], users: [], hashtags: [] });
    }
  }, [searchQuery]);

  const performSearch = async (query: string) => {
    setLoading(true);
    try {
      // Mock search results - replace with real API
      const mockResults = {
        tokens: [
          {
            id: '1',
            symbol: 'MEME',
            name: 'MemeToken',
            price: 0.0012,
            change24h: +15.3,
            marketCap: 1200000,
            holders: 342,
            creator: 'cryptokid'
          },
          {
            id: '2',
            symbol: 'HODL',
            name: 'HodlCoin',
            price: 0.0089,
            change24h: +25.1,
            marketCap: 2100000,
            holders: 567,
            creator: 'moonlambo'
          }
        ].filter(token => 
          token.symbol.toLowerCase().includes(query.toLowerCase()) ||
          token.name.toLowerCase().includes(query.toLowerCase()) ||
          token.creator.toLowerCase().includes(query.toLowerCase())
        ),
        users: [
          {
            id: '1',
            username: 'cryptokid',
            followers: 1200,
            tokens: 2,
            verified: true
          },
          {
            id: '2',
            username: 'moonlambo',
            followers: 890,
            tokens: 1,
            verified: false
          },
          {
            id: '3',
            username: 'memequeen',
            followers: 2400,
            tokens: 3,
            verified: true
          }
        ].filter(user => 
          user.username.toLowerCase().includes(query.toLowerCase())
        ),
        hashtags: [
          {
            id: '1',
            tag: 'MemeFlow',
            posts: 1234,
            trending: true
          },
          {
            id: '2',
            tag: 'ToTheMoon',
            posts: 567,
            trending: true
          },
          {
            id: '3',
            tag: 'DeFi',
            posts: 890,
            trending: false
          }
        ].filter(hashtag =>
          hashtag.tag.toLowerCase().includes(query.toLowerCase())
        )
      };

      setSearchResults(mockResults);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults({ tokens: [], users: [], hashtags: [] });
  };

  const formatNumber = (num: number) => {
    if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
    return num.toString();
  };

  const totalResults = searchResults.tokens.length + searchResults.users.length + searchResults.hashtags.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-transparent bg-gradient-to-r from-cyan-400 via-pink-400 to-purple-400 bg-clip-text">
          Search
        </h2>
        <div className="flex items-center space-x-2 text-sm text-white/60">
          <Search className="w-4 h-4 text-cyan-400" />
          <span>Discover tokens, users & trends</span>
        </div>
      </div>

      {/* Search Input */}
      <Card className="glass border border-white/10 p-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-white/50" />
          <Input
            placeholder="Search tokens, users, or hashtags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-10 bg-white/5 border-white/20 text-white placeholder-white/50 text-lg py-3"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              onClick={clearSearch}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-white/50 hover:text-white"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </Card>

      {/* Search Results */}
      {searchQuery ? (
        <div className="space-y-6">
          {/* Results Header */}
          <div className="flex items-center justify-between">
            <div className="text-white/70">
              {totalResults > 0 ? (
                `${totalResults} results for "${searchQuery}"`
              ) : loading ? (
                'Searching...'
              ) : (
                `No results for "${searchQuery}"`
              )}
            </div>
            
            {totalResults > 0 && (
              <div className="flex items-center space-x-2">
                <Button
                  variant={activeTab === 'all' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setActiveTab('all')}
                  className="text-white"
                >
                  All
                </Button>
                <Button
                  variant={activeTab === 'tokens' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setActiveTab('tokens')}
                  className="text-white"
                >
                  Tokens ({searchResults.tokens.length})
                </Button>
                <Button
                  variant={activeTab === 'users' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setActiveTab('users')}
                  className="text-white"
                >
                  Users ({searchResults.users.length})
                </Button>
                <Button
                  variant={activeTab === 'hashtags' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setActiveTab('hashtags')}
                  className="text-white"
                >
                  Hashtags ({searchResults.hashtags.length})
                </Button>
              </div>
            )}
          </div>

          {/* Tokens Results */}
          {(activeTab === 'all' || activeTab === 'tokens') && searchResults.tokens.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white flex items-center">
                <TrendingUp className="w-5 h-5 mr-2 text-cyan-400" />
                Tokens
              </h3>
              <div className="grid gap-4">
                {searchResults.tokens.map((token: any) => (
                  <Card key={token.id} className="glass border border-white/10 p-4 hover:border-white/20 transition-all duration-300">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-gradient-to-r from-cyan-400 to-purple-400 rounded-full flex items-center justify-center">
                          <span className="text-white font-bold text-sm">{token.symbol.slice(0, 3)}</span>
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <h4 className="font-semibold text-white">${token.symbol}</h4>
                            <Badge variant="outline" className="text-xs text-cyan-400 border-cyan-400">
                              {token.name}
                            </Badge>
                            <Badge variant="outline" className="text-xs text-white/60 border-white/20">
                              @{token.creator}
                            </Badge>
                          </div>
                          <div className="text-white/60 text-sm">
                            {formatNumber(token.holders)} holders • MCap ${formatNumber(token.marketCap)}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <div className="text-white font-semibold">${token.price.toFixed(4)}</div>
                          <div className={`text-sm ${
                            token.change24h > 0 ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {token.change24h > 0 ? '+' : ''}{token.change24h.toFixed(1)}%
                          </div>
                        </div>
                        
                        <Button size="sm" className="bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-600 hover:to-pink-600">
                          View
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Users Results */}
          {(activeTab === 'all' || activeTab === 'users') && searchResults.users.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white flex items-center">
                <Users className="w-5 h-5 mr-2 text-pink-400" />
                Users
              </h3>
              <div className="grid gap-4">
                {searchResults.users.map((searchUser: any) => (
                  <Card key={searchUser.id} className="glass border border-white/10 p-4 hover:border-white/20 transition-all duration-300">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <Avatar className="w-12 h-12 bg-gradient-to-r from-pink-400 to-purple-400 flex items-center justify-center">
                          <span className="text-white font-bold">
                            {searchUser.username[0].toUpperCase()}
                          </span>
                        </Avatar>
                        <div>
                          <div className="flex items-center space-x-2">
                            <h4 className="font-semibold text-white">@{searchUser.username}</h4>
                            {searchUser.verified && (
                              <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500">
                                ✓ Verified
                              </Badge>
                            )}
                          </div>
                          <div className="text-white/60 text-sm">
                            {formatNumber(searchUser.followers)} followers • {searchUser.tokens} tokens
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="text-pink-400 border-pink-400 hover:bg-pink-400/20"
                        >
                          Follow
                        </Button>
                        <Button 
                          size="sm" 
                          className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600"
                        >
                          View Profile
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Hashtags Results */}
          {(activeTab === 'all' || activeTab === 'hashtags') && searchResults.hashtags.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white flex items-center">
                <Hash className="w-5 h-5 mr-2 text-purple-400" />
                Hashtags
              </h3>
              <div className="grid gap-4">
                {searchResults.hashtags.map((hashtag: any) => (
                  <Card key={hashtag.id} className="glass border border-white/10 p-4 hover:border-white/20 transition-all duration-300">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-gradient-to-r from-purple-400 to-cyan-400 rounded-full flex items-center justify-center">
                          <Hash className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <h4 className="font-semibold text-white">#{hashtag.tag}</h4>
                            {hashtag.trending && (
                              <Badge className="bg-purple-500/20 text-purple-400 border-purple-500">
                                🔥 Trending
                              </Badge>
                            )}
                          </div>
                          <div className="text-white/60 text-sm">
                            {formatNumber(hashtag.posts)} posts
                          </div>
                        </div>
                      </div>
                      
                      <Button 
                        size="sm" 
                        className="bg-gradient-to-r from-purple-500 to-cyan-500 hover:from-purple-600 hover:to-cyan-600"
                      >
                        Explore
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Trending/Suggestions when no search */
        <div className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="glass border border-white/10 p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                <TrendingUp className="w-5 h-5 mr-2 text-cyan-400" />
                Trending Tokens
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-2 rounded bg-white/5">
                  <span className="text-white">$MEME</span>
                  <span className="text-green-400">+15.3%</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-white/5">
                  <span className="text-white">$HODL</span>
                  <span className="text-green-400">+25.1%</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-white/5">
                  <span className="text-white">$PEPE3</span>
                  <span className="text-green-400">+8.7%</span>
                </div>
              </div>
            </Card>

            <Card className="glass border border-white/10 p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                <Hash className="w-5 h-5 mr-2 text-purple-400" />
                Trending Hashtags
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-2 rounded bg-white/5">
                  <span className="text-white">#MemeFlow</span>
                  <span className="text-purple-400">1.2K posts</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-white/5">
                  <span className="text-white">#ToTheMoon</span>
                  <span className="text-purple-400">567 posts</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-white/5">
                  <span className="text-white">#DeFi</span>
                  <span className="text-purple-400">890 posts</span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
};