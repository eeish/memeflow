import React, { useState, useEffect } from 'react';
import { PersonalizedTicker } from './PersonalizedTicker';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import { 
  Play, 
  Heart, 
  MoreHorizontal, 
  TrendingUp, 
  Clock, 
  Sparkles,
  Flame,
  Zap,
  Star,
  Users,
  Crown,
  Rocket,
  ChevronRight,
  Volume2,
  Award,
  Target,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface UserToken {
  id: string;
  username: string;
  displayName: string;
  avatar?: string;
  tokenSymbol: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  holders: number;
  marketCap: number;
  isVerified?: boolean;
  launchedAt: string;
  tags?: string[];
  description?: string;
  tradingVolume?: number;
  weeklyGrowth?: number;
}

interface RecommendationSection {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  tokens: UserToken[];
  reason?: string;
  bgGradient?: string;
}

interface MarketProps {
  user: any;
}

// Generate mock user tokens data
const generateMockTokens = (count: number = 30): UserToken[] => {
  const usernames = [
    { username: 'elonmusk', displayName: 'Elon Musk', verified: true, tags: ['Tech', 'Space'] },
    { username: 'vitalik', displayName: 'Vitalik Buterin', verified: true, tags: ['Crypto', 'ETH'] },
    { username: 'cz_binance', displayName: 'CZ', verified: true, tags: ['Exchange', 'BNB'] },
    { username: 'satoshi', displayName: 'Satoshi Nakamoto', verified: false, tags: ['Bitcoin', 'Mystery'] },
    { username: 'pepe', displayName: 'Pepe The Frog', verified: false, tags: ['Meme', 'Classic'] },
    { username: 'doge', displayName: 'Doge', verified: false, tags: ['Meme', 'Dog'] },
    { username: 'moonboy', displayName: 'Moon Boy', verified: false, tags: ['DeFi', 'Yield'] },
    { username: 'diamondhands', displayName: 'Diamond Hands', verified: false, tags: ['HODL', 'Long'] },
    { username: 'whale', displayName: 'Whale Alert', verified: true, tags: ['Trading', 'Alerts'] },
    { username: 'degenape', displayName: 'Degen Ape', verified: false, tags: ['NFT', 'Ape'] },
    { username: 'saylor', displayName: 'Michael Saylor', verified: true, tags: ['Bitcoin', 'MicroStrategy'] },
    { username: 'cathie', displayName: 'Cathie Wood', verified: true, tags: ['ARK', 'Innovation'] },
    { username: 'punk6529', displayName: 'Punk6529', verified: false, tags: ['NFT', 'Culture'] },
    { username: 'cobie', displayName: 'Cobie', verified: true, tags: ['Trader', 'Analyst'] },
    { username: 'hsaka', displayName: 'Hsaka', verified: false, tags: ['DeFi', 'Builder'] },
    { username: 'loomdart', displayName: 'Loomdart', verified: false, tags: ['Trading', 'Memes'] },
    { username: 'gainzy', displayName: 'GainzyTV', verified: false, tags: ['Trader', 'Content'] },
    { username: 'kaleo', displayName: 'Kaleo', verified: true, tags: ['TA', 'Charts'] },
    { username: 'cryptoyoda', displayName: 'CryptoYoda', verified: false, tags: ['Wisdom', 'Memes'] },
    { username: 'inversebrah', displayName: 'InverseBrah', verified: false, tags: ['Contrarian', 'Trader'] },
  ];

  // Generate more tokens by cycling through usernames with variations
  const tokens: UserToken[] = [];
  for (let i = 0; i < count; i++) {
    const user = usernames[i % usernames.length];
    const suffix = i >= usernames.length ? `_${Math.floor(i / usernames.length)}` : '';
    
    tokens.push({
      id: `token-${i}`,
      username: user.username + suffix,
      displayName: user.displayName,
      avatar: undefined,
      tokenSymbol: (user.username + suffix).toUpperCase().slice(0, 4),
      price: Math.random() * 100 + 0.01,
      priceChange24h: (Math.random() - 0.5) * 40,
      volume24h: Math.random() * 1000000 + 10000,
      holders: Math.floor(Math.random() * 10000) + 100,
      marketCap: Math.random() * 10000000 + 100000,
      isVerified: user.verified,
      launchedAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
      tags: user.tags,
      description: `Leading voice in ${user.tags?.[0] || 'crypto'}`,
      tradingVolume: Math.random() * 500000,
      weeklyGrowth: (Math.random() - 0.3) * 100,
    });
  }

  return tokens;
};

export const Market: React.FC<MarketProps> = ({ user }) => {
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [likedTokens, setLikedTokens] = useState<Set<string>>(new Set());
  const [recommendations, setRecommendations] = useState<RecommendationSection[]>([]);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  // Number of cards to show initially (6 for landscape, fills one row)
  const INITIAL_DISPLAY_COUNT = 6;

  useEffect(() => {
    // Generate recommendation sections with more tokens
    const allTokens = generateMockTokens(60);
    
    const sections: RecommendationSection[] = [
      {
        id: 'trending-today',
        title: 'Trending Today',
        subtitle: '',
        icon: <Flame className="w-4 h-4" />,
        tokens: allTokens.filter(t => t.priceChange24h > 10).slice(0, 30),
        reason: 'High momentum tokens matching your interests',
        bgGradient: 'from-orange-500/10 to-red-500/10'
      },
      {
        id: 'new-launches',
        title: 'Fresh Launches',
        subtitle: '',
        icon: <Rocket className="w-4 h-4" />,
        tokens: allTokens.sort((a, b) => new Date(b.launchedAt).getTime() - new Date(a.launchedAt).getTime()).slice(0, 25),
        reason: 'Recently launched tokens with growing communities',
        bgGradient: 'from-purple-500/10 to-pink-500/10'
      },
      {
        id: 'top-performers',
        title: 'Top Performers',
        subtitle: '',
        icon: <Crown className="w-4 h-4" />,
        tokens: allTokens.sort((a, b) => b.weeklyGrowth! - a.weeklyGrowth!).slice(0, 20),
        reason: 'Consistent growth and strong fundamentals',
        bgGradient: 'from-yellow-500/10 to-amber-500/10'
      },
      {
        id: 'community-picks',
        title: 'Community Favorites',
        subtitle: '',
        icon: <Users className="w-4 h-4" />,
        tokens: allTokens.sort((a, b) => b.holders - a.holders).slice(0, 25),
        reason: 'Popular among similar traders',
        bgGradient: 'from-blue-500/10 to-cyan-500/10'
      },
      {
        id: 'high-volume',
        title: 'High Volume',
        subtitle: '',
        icon: <Volume2 className="w-4 h-4" />,
        tokens: allTokens.sort((a, b) => b.volume24h - a.volume24h).slice(0, 20),
        reason: 'High liquidity for easy trading',
        bgGradient: 'from-green-500/10 to-emerald-500/10'
      }
    ];

    setRecommendations(sections);
  }, []);

  const handleUserClick = (username: string) => {
    setSelectedUser(username);
    console.log('Navigate to user profile:', username);
  };

  const handleLikeToken = (tokenId: string) => {
    setLikedTokens(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tokenId)) {
        newSet.delete(tokenId);
      } else {
        newSet.add(tokenId);
      }
      return newSet;
    });
  };

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId);
      } else {
        newSet.add(sectionId);
      }
      return newSet;
    });
  };

  const formatPrice = (price: number) => {
    if (price < 0.01) return `$${price.toFixed(4)}`;
    if (price < 1) return `$${price.toFixed(3)}`;
    if (price < 100) return `$${price.toFixed(2)}`;
    return `$${price.toFixed(0)}`;
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toFixed(0);
  };

  const getDaysAgo = (dateStr: string) => {
    const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return '1d';
    if (days < 7) return `${days}d`;
    if (days < 30) return `${Math.floor(days / 7)}w`;
    return `${Math.floor(days / 30)}mo`;
  };

  return (
    <div className="w-full space-y-6">
      {/* Live Ticker Bar */}
      <div className="bg-gradient-to-r from-gray-50 via-white to-gray-50 rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="bg-gradient-to-r from-purple-600/5 via-pink-600/5 to-cyan-600/5 backdrop-blur-sm">
          <PersonalizedTicker speed={35} onUserClick={handleUserClick} />
        </div>
      </div>

      {/* Main Content */}
      <div className="space-y-8">
        {/* Personalized Greeting */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}
            </h1>
          </div>
          <Button variant="outline" className="gap-2 text-xs h-8">
            <Target className="w-3 h-3" />
            Customize
          </Button>
        </div>

        {/* Recommendation Sections */}
        {recommendations.map((section) => {
          const isExpanded = expandedSections.has(section.id);
          const displayTokens = isExpanded ? section.tokens : section.tokens.slice(0, INITIAL_DISPLAY_COUNT);
          const hasMore = section.tokens.length > INITIAL_DISPLAY_COUNT;

          return (
            <section key={section.id} className="space-y-3">
              {/* Section Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`p-1 rounded-md bg-gradient-to-br ${section.bgGradient}`}>
                    {section.icon}
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-gray-900">{section.title}</h2>
                    {section.subtitle && <p className="text-xs text-gray-600">{section.subtitle}</p>}
                  </div>
                </div>
                {hasMore && (
                  <Button 
                    variant="ghost" 
                    className="gap-1 text-gray-600 hover:text-gray-900 text-xs h-7 px-2"
                    onClick={() => toggleSection(section.id)}
                  >
                    {isExpanded ? (
                      <>Show less <ChevronUp className="w-3 h-3" /></>
                    ) : (
                      <>Show all ({section.tokens.length}) <ChevronDown className="w-3 h-3" /></>
                    )}
                  </Button>
                )}
              </div>

              {/* Recommendation Reason */}
              {section.reason && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Sparkles className="w-3 h-3" />
                  <span>{section.reason}</span>
                </div>
              )}

              {/* Token Cards Grid - 1/6th screen width */}
              <div className="flex flex-wrap gap-3">
                {displayTokens.map((token) => (
                  <Card
                    key={token.id}
                    className="group relative bg-white hover:bg-gray-50 transition-all duration-300 cursor-pointer shadow-md hover:shadow-xl hover:scale-105 overflow-hidden"
                    style={{ 
                      width: 'calc((100% - 15px) / 6)', // 1/6th of container width
                      maxWidth: '200px', // Reasonable max for large screens
                      minWidth: '120px', // Min size for usability
                      aspectRatio: '1/1'
                    }}
                    onMouseEnter={() => setHoveredCard(token.id)}
                    onMouseLeave={() => setHoveredCard(null)}
                    onClick={() => handleUserClick(token.username)}
                  >
                    {/* Album Cover Style Image */}
                    <div className="relative w-full h-full bg-gradient-to-br from-indigo-400 via-purple-400 to-pink-400 p-[1px]">
                      <div className="relative w-full h-full bg-white overflow-hidden">
                        {/* User Avatar */}
                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-pink-500/10" />
                        <div className="absolute inset-0 flex items-center justify-center p-3">
                          <Avatar className="w-16 h-16 ring-2 ring-white/50 shadow-xl">
                            {token.avatar && (
                              <AvatarImage src={token.avatar} alt={token.displayName} />
                            )}
                            <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-lg font-bold">
                              {token.username[0].toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        </div>

                        {/* Play Button Overlay */}
                        <div className={`absolute bottom-2 right-2 transition-all duration-200 ${
                          hoveredCard === token.id ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
                        }`}>
                          <button
                            className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUserClick(token.username);
                            }}
                          >
                            <Play className="w-4 h-4 text-white fill-current ml-0.5" />
                          </button>
                        </div>

                        {/* Verified Badge */}
                        {token.isVerified && (
                          <div className="absolute top-2 right-2">
                            <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                              <Award className="w-3.5 h-3.5 text-white" />
                            </div>
                          </div>
                        )}

                        {/* Price Change Badge */}
                        <div className="absolute top-2 left-2">
                          <Badge 
                            className={`${
                              token.priceChange24h > 0 
                                ? 'bg-green-500/90 text-white' 
                                : 'bg-red-500/90 text-white'
                            } border-0 text-xs font-bold px-2 py-1`}
                          >
                            {token.priceChange24h > 0 ? '+' : ''}{Math.round(token.priceChange24h)}%
                          </Badge>
                        </div>
                      </div>
                    </div>

                    {/* Content Overlay */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-3 pt-8">
                      <div className="text-white space-y-1">
                        <p className="text-sm font-bold truncate">
                          {token.displayName}
                        </p>
                        <p className="text-[11px] opacity-90 truncate">
                          @{token.username} • ${token.tokenSymbol}
                        </p>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold">{formatPrice(token.price)}</span>
                          <span className="opacity-80">{formatNumber(token.holders)} holders</span>
                        </div>
                        {/* Tags */}
                        {token.tags && token.tags.length > 0 && (
                          <div className="flex gap-1 mt-1">
                            {token.tags.slice(0, 2).map(tag => (
                              <span 
                                key={tag} 
                                className="text-[9px] px-1.5 py-0.5 bg-white/20 backdrop-blur-sm text-white/90 rounded-full"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Like button on hover */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLikeToken(token.id);
                      }}
                      className={`absolute top-2 left-2 p-1 transition-opacity duration-200 ${
                        hoveredCard === token.id || likedTokens.has(token.id) ? 'opacity-100' : 'opacity-0'
                      }`}
                    >
                      <Heart 
                        className={`w-5 h-5 drop-shadow-lg transition-colors ${
                          likedTokens.has(token.id) 
                            ? 'text-red-500 fill-current' 
                            : 'text-white hover:text-red-400'
                        }`} 
                      />
                    </button>
                  </Card>
                ))}
              </div>

              {/* Show remaining count when collapsed */}
              {!isExpanded && hasMore && (
                <div className="text-center py-2">
                  <span className="text-sm text-gray-500">
                    +{section.tokens.length - INITIAL_DISPLAY_COUNT} more tokens available
                  </span>
                </div>
              )}
            </section>
          );
        })}

        {/* Quick Stats Bar - Compact */}
        <div className="grid grid-cols-4 gap-2 p-3 bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50 rounded-lg">
          <div className="text-center">
            <div className="text-lg font-bold text-gray-900">
              {formatNumber(recommendations.reduce((acc, s) => acc + s.tokens.length, 0))}
            </div>
            <div className="text-[10px] text-gray-600">Tokens</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-green-600">
              +{Math.round(recommendations[0]?.tokens[0]?.priceChange24h || 0)}%
            </div>
            <div className="text-[10px] text-gray-600">Top Gainer</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-gray-900">
              ${formatNumber(recommendations.reduce((acc, s) => acc + s.tokens.reduce((a, t) => a + t.volume24h, 0), 0))}
            </div>
            <div className="text-[10px] text-gray-600">Volume</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-gray-900">
              {likedTokens.size}
            </div>
            <div className="text-[10px] text-gray-600">Liked</div>
          </div>
        </div>
      </div>

    </div>
  );
};