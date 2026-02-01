import React, { useState, useEffect, useRef } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from './ui-simple/Avatar';
import { TrendingUp, TrendingDown, Sparkles, Flame, Star } from './ui-simple/Icons';

interface TickerItem {
  id: string;
  username: string;
  displayName?: string;
  avatar?: string;
  tokenSymbol: string;
  currentPrice: number;
  priceChange24h: number;
  priceChangePercent: number;
  volume24h: number;
  holders: number;
  isHot?: boolean;
  isNew?: boolean;
}

interface PersonalizedTickerProps {
  className?: string;
  speed?: number; // pixels per second
  onUserClick?: (username: string) => void;
}

// Mock data generator for demonstration
const generateMockTickerData = (): TickerItem[] => {
  const names = [
    { username: 'moonshot', displayName: 'MoonShot King', avatar: '🚀' },
    { username: 'diamondhands', displayName: 'Diamond Hands', avatar: '💎' },
    { username: 'whaleking', displayName: 'Whale King', avatar: '🐋' },
    { username: 'memegod', displayName: 'Meme God', avatar: '👑' },
    { username: 'rocketman', displayName: 'Rocket Man', avatar: '🎯' },
    { username: 'cryptoqueen', displayName: 'Crypto Queen', avatar: '👸' },
    { username: 'hodler', displayName: 'HODL Master', avatar: '🔒' },
    { username: 'degenape', displayName: 'Degen Ape', avatar: '🦍' },
    { username: 'moonfairy', displayName: 'Moon Fairy', avatar: '🧚' },
    { username: 'satoshi', displayName: 'Baby Satoshi', avatar: '₿' },
    { username: 'pepeking', displayName: 'Pepe King', avatar: '🐸' },
    { username: 'shibmaster', displayName: 'Shib Master', avatar: '🐕' }
  ];

  return names.map((user, index) => ({
    id: `user-${index}`,
    username: user.username,
    displayName: user.displayName,
    avatar: undefined, // Will use emoji fallback
    tokenSymbol: user.username.toUpperCase().slice(0, 4),
    currentPrice: Math.random() * 10 + 0.001,
    priceChange24h: (Math.random() - 0.5) * 2,
    priceChangePercent: (Math.random() - 0.5) * 40,
    volume24h: Math.random() * 100000,
    holders: Math.floor(Math.random() * 5000) + 100,
    isHot: Math.random() > 0.7,
    isNew: Math.random() > 0.8
  }));
};

export const PersonalizedTicker: React.FC<PersonalizedTickerProps> = ({ 
  className = '', 
  speed = 30,
  onUserClick 
}) => {
  const [tickerData, setTickerData] = useState<TickerItem[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const tickerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    // Initialize with mock data
    const mockData = generateMockTickerData();
    // Duplicate the data for seamless scrolling
    setTickerData([...mockData, ...mockData]);

    // Simulate real-time price updates
    const priceUpdateInterval = setInterval(() => {
      setTickerData(prev => prev.map(item => ({
        ...item,
        currentPrice: item.currentPrice * (1 + (Math.random() - 0.5) * 0.02),
        priceChangePercent: item.priceChangePercent + (Math.random() - 0.5) * 0.5
      })));
    }, 3000);

    return () => clearInterval(priceUpdateInterval);
  }, []);

  useEffect(() => {
    if (!tickerRef.current || isPaused) return;

    let scrollPosition = 0;
    const ticker = tickerRef.current;
    const scrollWidth = ticker.scrollWidth / 2; // Half because we duplicated the content

    const animate = () => {
      scrollPosition += speed / 60; // 60fps
      
      if (scrollPosition >= scrollWidth) {
        scrollPosition = 0;
      }
      
      ticker.style.transform = `translateX(-${scrollPosition}px)`;
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [speed, isPaused, tickerData]);

  const handleTickerClick = (username: string) => {
    // Notify parent component about the click
    if (onUserClick) {
      onUserClick(username);
    }
  };

  const formatPrice = (price: number) => {
    if (price < 0.01) return price.toFixed(6);
    if (price < 1) return price.toFixed(4);
    return price.toFixed(2);
  };

  const formatChange = (change: number) => {
    const formatted = Math.abs(change).toFixed(1);
    return change >= 0 ? `+${formatted}%` : `-${formatted}%`;
  };

  return (
    <div 
      className={`relative overflow-hidden bg-white ${className}`}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Gradient edges for smooth fade */}
      <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none" />
      
      {/* Ticker content */}
      <div className="py-3 px-4">
        <div 
          ref={tickerRef}
          className="flex items-center gap-6 whitespace-nowrap"
          style={{ willChange: 'transform' }}
        >
          {tickerData.map((item, index) => (
            <button
              key={`${item.id}-${index}`}
              onClick={() => handleTickerClick(item.username)}
              className="group flex items-center gap-3 px-4 py-2 rounded-lg bg-gray-50 hover:bg-gradient-to-r hover:from-purple-50 hover:to-pink-50 border border-gray-200 hover:border-purple-200 transition-all duration-300 hover:shadow-md cursor-pointer"
            >
              {/* Status badges */}
              {item.isHot && (
                <div className="absolute -top-1 -right-1">
                  <Flame className="w-3 h-3 text-orange-500" />
                </div>
              )}
              {item.isNew && (
                <div className="absolute -top-1 -left-1">
                  <Sparkles className="w-3 h-3 text-purple-500" />
                </div>
              )}
              
              {/* Avatar */}
              <div className="relative">
                <Avatar className="w-8 h-8 ring-2 ring-gray-200 group-hover:ring-purple-300 transition-all">
                  {item.avatar && (
                    <AvatarImage src={item.avatar} alt={item.username} />
                  )}
                  <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white text-xs font-bold">
                    {item.username[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {item.holders > 1000 && (
                  <div className="absolute -bottom-1 -right-1 bg-gradient-to-r from-yellow-400 to-orange-400 rounded-full p-0.5">
                    <Star className="w-2.5 h-2.5 text-white fill-current" />
                  </div>
                )}
              </div>
              
              {/* User info */}
              <div className="flex flex-col items-start">
                <div className="flex items-center gap-1">
                  <span className="text-gray-800 font-semibold text-sm">
                    @{item.username}
                  </span>
                  <span className="text-purple-600 text-xs font-medium">
                    ${item.tokenSymbol}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-gray-600 text-xs font-mono">
                    {formatPrice(item.currentPrice)} SUI
                  </span>
                </div>
              </div>
              
              {/* Price change indicator */}
              <div className={`flex items-center gap-1 px-2 py-1 rounded-md ${
                item.priceChangePercent >= 0 
                  ? 'bg-green-50 text-green-600' 
                  : 'bg-red-50 text-red-600'
              }`}>
                {item.priceChangePercent >= 0 ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                <span className="text-xs font-semibold">
                  {formatChange(item.priceChangePercent)}
                </span>
              </div>
              
              {/* Volume indicator */}
              <div className="text-xs text-gray-500">
                <span className="text-gray-700 font-semibold">{item.holders}</span> holders
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
