import React, { useState, useEffect } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { TrendingUp, TrendingDown, Eye, Star, Filter, Coins } from 'lucide-react';

interface TokenDashboardProps {
  user: any;
}

export const TokenDashboard: React.FC<TokenDashboardProps> = ({ user }) => {
  const [tokens, setTokens] = useState<any[]>([]);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState('volume24h');

  useEffect(() => {
    fetchTokens();
    loadWatchlist();
  }, []);

  const fetchTokens = async () => {
    try {
      // TODO: Implement real API call to fetch tokens from backend
      // For now, start with empty array
      setTokens([]);
    } catch (error) {
      console.error('Failed to fetch tokens:', error);
    }
  };

  const loadWatchlist = () => {
    const saved = localStorage.getItem('token_watchlist');
    if (saved) {
      setWatchlist(JSON.parse(saved));
    }
  };

  const toggleWatchlist = (tokenId: string) => {
    const newWatchlist = watchlist.includes(tokenId)
      ? watchlist.filter(id => id !== tokenId)
      : [...watchlist, tokenId];
    
    setWatchlist(newWatchlist);
    localStorage.setItem('token_watchlist', JSON.stringify(newWatchlist));
  };

  const sortedTokens = [...tokens].sort((a, b) => {
    switch (sortBy) {
      case 'change24h':
        return b.change24h - a.change24h;
      case 'volume24h':
        return b.volume24h - a.volume24h;
      case 'holders':
        return b.holders - a.holders;
      default:
        return 0;
    }
  });

  const formatNumber = (num: number) => {
    if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
    return num.toString();
  };

  const myTokens = tokens.filter(token => token.creator === user.username);
  const watchlistTokens = tokens.filter(token => watchlist.includes(token.id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">
          Token Market
        </h2>
        <div className="flex items-center space-x-2">
          <Coins className="w-5 h-5 text-blue-600" />
          <span className="text-gray-600">Live Prices</span>
        </div>
      </div>

      <Tabs defaultValue="all" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 bg-gray-100">
          <TabsTrigger value="all" className="text-gray-700 data-[state=active]:bg-blue-500 data-[state=active]:text-white">
            All Tokens
          </TabsTrigger>
          <TabsTrigger value="my" className="text-gray-700 data-[state=active]:bg-purple-500 data-[state=active]:text-white">
            My Tokens ({myTokens.length})
          </TabsTrigger>
          <TabsTrigger value="watchlist" className="text-gray-700 data-[state=active]:bg-green-500 data-[state=active]:text-white">
            Watchlist ({watchlistTokens.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-gray-600">
              {tokens.length} tokens found
            </div>
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-white border border-gray-300 text-gray-900 text-sm px-3 py-1 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                <option value="change24h">24h Change</option>
                <option value="volume24h">Volume</option>
                <option value="holders">Holders</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4">
            {sortedTokens.map((token) => (
              <Card key={token.id} className="bg-white border border-[#ECECEC] p-6 hover:border-gray-300 transition-all duration-300">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                      <span className="text-white font-bold text-sm">{token.symbol.slice(0, 3)}</span>
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="font-semibold text-gray-900">${token.symbol}</h3>
                        <Badge variant="outline" className="text-xs text-blue-600 border-blue-300 bg-blue-50">
                          {token.name}
                        </Badge>
                        <Badge variant="outline" className="text-xs text-gray-600 border-gray-300">
                          @{token.creator}
                        </Badge>
                      </div>
                      <p className="text-gray-600 text-sm mt-1">{token.description}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-6">
                    <div className="text-right">
                      <div className="text-gray-900 font-semibold">${token.price.toFixed(4)}</div>
                      <div className={`flex items-center text-sm ${
                        token.change24h > 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {token.change24h > 0 ? (
                          <TrendingUp className="w-3 h-3 mr-1" />
                        ) : (
                          <TrendingDown className="w-3 h-3 mr-1" />
                        )}
                        {token.change24h > 0 ? '+' : ''}{token.change24h.toFixed(1)}%
                      </div>
                    </div>
                    
                    <div className="text-right text-sm">
                      <div className="text-gray-600">Vol: ${formatNumber(token.volume24h)}</div>
                      <div className="text-gray-500">{token.holders} holders</div>
                    </div>
                    
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleWatchlist(token.id)}
                      className={`${
                        watchlist.includes(token.id) 
                          ? 'text-yellow-600 hover:text-yellow-700' 
                          : 'text-gray-400 hover:text-yellow-600'
                      }`}
                    >
                      <Star className={`w-4 h-4 ${watchlist.includes(token.id) ? 'fill-current' : ''}`} />
                    </Button>
                    
                    <Button size="sm" className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600">
                      <Eye className="w-4 h-4 mr-2" />
                      View
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="my" className="space-y-4">
          {myTokens.length > 0 ? (
            <div className="grid gap-4">
              {myTokens.map((token) => (
                <Card key={token.id} className="bg-white border border-purple-200 p-6 bg-gradient-to-r from-purple-50 to-pink-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                        <span className="text-white font-bold text-sm">{token.symbol.slice(0, 3)}</span>
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h3 className="font-semibold text-gray-900">${token.symbol}</h3>
                          <Badge className="bg-purple-100 text-purple-700 border-purple-300">
                            Your Token
                          </Badge>
                        </div>
                        <p className="text-gray-600 text-sm mt-1">{token.description}</p>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="text-gray-900 font-semibold">${token.price.toFixed(4)}</div>
                      <div className="text-gray-600 text-sm">{token.holders} holders</div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="bg-white border border-[#ECECEC] p-12 text-center">
              <Coins className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-700 mb-2">No tokens created yet</h3>
              <p className="text-gray-600 mb-4">Your username automatically becomes a token when you join!</p>
              <Button className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600">
                Create ${user.username?.toUpperCase()} Token
              </Button>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="watchlist" className="space-y-4">
          {watchlistTokens.length > 0 ? (
            <div className="grid gap-4">
              {watchlistTokens.map((token) => (
                <Card key={token.id} className="bg-white border border-yellow-200 p-6 bg-gradient-to-r from-yellow-50 to-orange-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-full flex items-center justify-center">
                        <span className="text-white font-bold text-sm">{token.symbol.slice(0, 3)}</span>
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h3 className="font-semibold text-gray-900">${token.symbol}</h3>
                          <Badge className="bg-yellow-100 text-yellow-700 border-yellow-300">
                            <Star className="w-3 h-3 mr-1 fill-current" />
                            Watchlist
                          </Badge>
                        </div>
                        <p className="text-gray-600 text-sm mt-1">{token.description}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-6">
                      <div className="text-right">
                        <div className="text-gray-900 font-semibold">${token.price.toFixed(4)}</div>
                        <div className={`text-sm ${
                          token.change24h > 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {token.change24h > 0 ? '+' : ''}{token.change24h.toFixed(1)}%
                        </div>
                      </div>
                      
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleWatchlist(token.id)}
                        className="text-yellow-600 hover:text-yellow-700"
                      >
                        <Star className="w-4 h-4 fill-current" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="bg-white border border-[#ECECEC] p-12 text-center">
              <Star className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-700 mb-2">No tokens in watchlist</h3>
              <p className="text-gray-600">Star tokens you're interested in to track them here!</p>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};