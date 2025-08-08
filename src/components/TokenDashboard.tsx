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
  const [sortBy, setSortBy] = useState('marketCap');

  useEffect(() => {
    fetchTokens();
    loadWatchlist();
  }, []);

  const fetchTokens = async () => {
    try {
      // Mock token data - replace with real API
      const mockTokens = [
        {
          id: '1',
          symbol: 'MEME',
          name: 'MemeToken',
          price: 0.0012,
          change24h: +15.3,
          marketCap: 1200000,
          volume24h: 89000,
          holders: 342,
          creator: 'cryptokid',
          description: 'The ultimate meme token for the culture',
          created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString()
        },
        {
          id: '2',
          symbol: 'HODL',
          name: 'HodlCoin',
          price: 0.0089,
          change24h: +25.1,
          marketCap: 2100000,
          volume24h: 156000,
          holders: 567,
          creator: 'moonlambo',
          description: 'For the diamond hands only',
          created_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString()
        },
        {
          id: '3',
          symbol: 'DOGE2',
          name: 'DogeRevolution',
          price: 0.0034,
          change24h: -5.2,
          marketCap: 890000,
          volume24h: 67000,
          holders: 234,
          creator: 'memequeen',
          description: 'The new generation of doge',
          created_at: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString()
        },
        {
          id: '4',
          symbol: 'PEPE3',
          name: 'PepeCoin3.0',
          price: 0.0067,
          change24h: +8.7,
          marketCap: 1500000,
          volume24h: 123000,
          holders: 445,
          creator: 'pepemaster',
          description: 'Pepe but make it better',
          created_at: new Date(Date.now() - 1000 * 60 * 60 * 96).toISOString()
        }
      ];
      setTokens(mockTokens);
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
      case 'marketCap':
        return b.marketCap - a.marketCap;
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
        <h2 className="text-2xl font-bold text-transparent bg-gradient-to-r from-cyan-400 via-pink-400 to-purple-400 bg-clip-text">
          Token Market
        </h2>
        <div className="flex items-center space-x-2">
          <Coins className="w-5 h-5 text-cyan-400" />
          <span className="text-white/70">Live Prices</span>
        </div>
      </div>

      <Tabs defaultValue="all" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 bg-white/5">
          <TabsTrigger value="all" className="text-white data-[state=active]:bg-cyan-500/20">
            All Tokens
          </TabsTrigger>
          <TabsTrigger value="my" className="text-white data-[state=active]:bg-pink-500/20">
            My Tokens ({myTokens.length})
          </TabsTrigger>
          <TabsTrigger value="watchlist" className="text-white data-[state=active]:bg-purple-500/20">
            Watchlist ({watchlistTokens.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-white/70">
              {tokens.length} tokens found
            </div>
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-white/50" />
              <select 
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-white/5 border border-white/20 text-white text-sm px-3 py-1 rounded"
              >
                <option value="marketCap">Market Cap</option>
                <option value="change24h">24h Change</option>
                <option value="volume24h">Volume</option>
                <option value="holders">Holders</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4">
            {sortedTokens.map((token) => (
              <Card key={token.id} className="glass border border-white/10 p-6 hover:border-white/20 transition-all duration-300">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-gradient-to-r from-cyan-400 to-purple-400 rounded-full flex items-center justify-center">
                      <span className="text-white font-bold text-sm">{token.symbol.slice(0, 3)}</span>
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="font-semibold text-white">${token.symbol}</h3>
                        <Badge variant="outline" className="text-xs text-cyan-400 border-cyan-400">
                          {token.name}
                        </Badge>
                        <Badge variant="outline" className="text-xs text-white/60 border-white/20">
                          @{token.creator}
                        </Badge>
                      </div>
                      <p className="text-white/60 text-sm mt-1">{token.description}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-6">
                    <div className="text-right">
                      <div className="text-white font-semibold">${token.price.toFixed(4)}</div>
                      <div className={`flex items-center text-sm ${
                        token.change24h > 0 ? 'text-green-400' : 'text-red-400'
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
                      <div className="text-white/70">MCap: ${formatNumber(token.marketCap)}</div>
                      <div className="text-white/60">Vol: ${formatNumber(token.volume24h)}</div>
                      <div className="text-white/50">{token.holders} holders</div>
                    </div>
                    
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleWatchlist(token.id)}
                      className={`${
                        watchlist.includes(token.id) 
                          ? 'text-yellow-400 hover:text-yellow-300' 
                          : 'text-white/50 hover:text-yellow-400'
                      }`}
                    >
                      <Star className={`w-4 h-4 ${watchlist.includes(token.id) ? 'fill-current' : ''}`} />
                    </Button>
                    
                    <Button size="sm" className="bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-600 hover:to-pink-600">
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
                <Card key={token.id} className="glass border border-pink-500/30 p-6 bg-gradient-to-r from-pink-500/10 to-purple-500/10">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-gradient-to-r from-pink-400 to-purple-400 rounded-full flex items-center justify-center">
                        <span className="text-white font-bold text-sm">{token.symbol.slice(0, 3)}</span>
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h3 className="font-semibold text-white">${token.symbol}</h3>
                          <Badge className="bg-pink-500/20 text-pink-400 border-pink-500">
                            Your Token
                          </Badge>
                        </div>
                        <p className="text-white/60 text-sm mt-1">{token.description}</p>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="text-white font-semibold">${token.price.toFixed(4)}</div>
                      <div className="text-white/70 text-sm">MCap: ${formatNumber(token.marketCap)}</div>
                      <div className="text-white/60 text-sm">{token.holders} holders</div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="glass border border-white/10 p-12 text-center">
              <Coins className="w-16 h-16 text-white/30 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white/70 mb-2">No tokens created yet</h3>
              <p className="text-white/50 mb-4">Your username automatically becomes a token when you join!</p>
              <Button className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600">
                Create ${user.username?.toUpperCase()} Token
              </Button>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="watchlist" className="space-y-4">
          {watchlistTokens.length > 0 ? (
            <div className="grid gap-4">
              {watchlistTokens.map((token) => (
                <Card key={token.id} className="glass border border-yellow-500/30 p-6 bg-gradient-to-r from-yellow-500/10 to-orange-500/10">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-gradient-to-r from-yellow-400 to-orange-400 rounded-full flex items-center justify-center">
                        <span className="text-white font-bold text-sm">{token.symbol.slice(0, 3)}</span>
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h3 className="font-semibold text-white">${token.symbol}</h3>
                          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500">
                            <Star className="w-3 h-3 mr-1 fill-current" />
                            Watchlist
                          </Badge>
                        </div>
                        <p className="text-white/60 text-sm mt-1">{token.description}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-6">
                      <div className="text-right">
                        <div className="text-white font-semibold">${token.price.toFixed(4)}</div>
                        <div className={`text-sm ${
                          token.change24h > 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {token.change24h > 0 ? '+' : ''}{token.change24h.toFixed(1)}%
                        </div>
                      </div>
                      
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleWatchlist(token.id)}
                        className="text-yellow-400 hover:text-yellow-300"
                      >
                        <Star className="w-4 h-4 fill-current" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="glass border border-white/10 p-12 text-center">
              <Star className="w-16 h-16 text-white/30 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white/70 mb-2">No tokens in watchlist</h3>
              <p className="text-white/50">Star tokens you're interested in to track them here!</p>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};