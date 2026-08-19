import React, { useState } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Avatar, AvatarImage, AvatarFallback } from './ui/avatar';
import { HoverCard, HoverCardTrigger, HoverCardContent } from './ui/hover-card';
import { Heart, MessageCircle, Share, TrendingUp, UserPlus, ShoppingCart } from 'lucide-react';

interface MinimalPostCardProps {
  post: {
    id: string;
    author: {
      id: string;
      username: string;
      display_name?: string;
      avatar?: string;
      token_price?: number;
      token_symbol?: string;
    };
    content: string;
    created_at: string;
    likes_count: number;
    comments_count: number;
  };
  user?: any;
  onLike?: (postId: string) => void;
  onFollow?: (userId: string) => void;
  onBuy?: (userId: string) => void;
  isFollowing?: boolean;
  isLiked?: boolean;
}

export const MinimalPostCard: React.FC<MinimalPostCardProps> = ({ 
  post, 
  user,
  onLike,
  onFollow,
  onBuy,
  isFollowing = false,
  isLiked = false
}) => {
  const [showLikeCount, setShowLikeCount] = useState(false);

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'now';
    if (diffInMinutes < 60) return `${diffInMinutes}m`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h`;
    return `${Math.floor(diffInMinutes / 1440)}d`;
  };

  const formatPrice = (price: number) => {
    if (price >= 1000000) return `$${(price / 1000000).toFixed(2)}M`;
    if (price >= 1000) return `$${(price / 1000).toFixed(2)}K`;
    return `$${price.toFixed(4)}`;
  };

  const UserHoverCard = () => (
    <div className="w-72 space-y-4">
      {/* User Info */}
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-3">
          <Avatar className="w-12 h-12 bg-gradient-to-br from-neutral-200 to-neutral-300 flex items-center justify-center">
            <span className="text-neutral-700 font-medium text-sm">
              {post.author.username[0].toUpperCase()}
            </span>
          </Avatar>
          <div>
            <p className="font-medium text-neutral-900">@{post.author.username}</p>
            {post.author.display_name && (
              <p className="text-sm text-neutral-500">{post.author.display_name}</p>
            )}
          </div>
        </div>
      </div>

      {/* Token Price */}
      <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-100">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Token Price</span>
          <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
        </div>
        <div className="flex items-baseline space-x-2">
          <span className="text-2xl font-semibold text-neutral-900">
            {formatPrice(post.author.token_price || 0.0234)}
          </span>
          <span className="text-sm text-neutral-500">
            {post.author.token_symbol || 'MEME'}
          </span>
        </div>
        <div className="mt-1">
          <span className="text-xs text-emerald-600 font-medium">+12.5% (24h)</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button
          onClick={() => onFollow?.(post.author.id)}
          variant={isFollowing ? "outline" : "default"}
          className={`flex-1 h-10 rounded-xl font-medium transition-all ${
            isFollowing 
              ? 'bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-50' 
              : 'bg-neutral-900 text-white hover:bg-neutral-800'
          }`}
        >
          <UserPlus className="w-4 h-4 mr-1.5" />
          {isFollowing ? 'Following' : 'Follow'}
        </Button>
        <Button
          onClick={() => onBuy?.(post.author.id)}
          className="flex-1 h-10 bg-emerald-500 text-white hover:bg-emerald-600 rounded-xl font-medium transition-all"
        >
          <ShoppingCart className="w-4 h-4 mr-1.5" />
          Buy
        </Button>
      </div>
    </div>
  );

  return (
    <Card className="bg-white border-neutral-100 rounded-2xl p-5 hover:shadow-lg transition-all duration-300 hover:border-neutral-200">
      <div className="flex space-x-3.5">
        {/* Avatar with Hover Card */}
        <HoverCard openDelay={200} closeDelay={100}>
          <HoverCardTrigger asChild>
            <Avatar className="w-11 h-11 bg-gradient-to-br from-neutral-200 to-neutral-300 flex items-center justify-center cursor-pointer transition-transform hover:scale-105">
              <span className="text-neutral-700 font-medium text-sm">
                {post.author.username[0].toUpperCase()}
              </span>
            </Avatar>
          </HoverCardTrigger>
          <HoverCardContent 
            className="w-auto p-5 bg-white border-neutral-100 shadow-xl rounded-2xl"
            sideOffset={8}
          >
            <UserHoverCard />
          </HoverCardContent>
        </HoverCard>

        {/* Post Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center space-x-2 mb-2">
            <HoverCard openDelay={200} closeDelay={100}>
              <HoverCardTrigger asChild>
                <span className="font-medium text-neutral-900 hover:underline cursor-pointer">
                  @{post.author.username}
                </span>
              </HoverCardTrigger>
              <HoverCardContent 
                className="w-auto p-5 bg-white border-neutral-100 shadow-xl rounded-2xl"
                sideOffset={8}
              >
                <UserHoverCard />
              </HoverCardContent>
            </HoverCard>
            <span className="text-neutral-400">·</span>
            <span className="text-sm text-neutral-500">{formatTimeAgo(post.created_at)}</span>
          </div>

          {/* Content */}
          <p className="text-neutral-800 leading-relaxed mb-3.5 text-[15px]">
            {post.content}
          </p>

          {/* Minimal Actions */}
          <div className="flex items-center space-x-1">
            {/* Like Button */}
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onLike?.(post.id)}
                onMouseEnter={() => setShowLikeCount(true)}
                onMouseLeave={() => setShowLikeCount(false)}
                className={`h-8 px-2.5 rounded-full hover:bg-red-50 transition-all ${
                  isLiked ? 'text-red-500' : 'text-neutral-500 hover:text-red-500'
                }`}
              >
                <Heart className={`w-4 h-4 transition-all ${isLiked ? 'fill-current' : ''}`} />
              </Button>
              
              {/* Like count on hover */}
              {showLikeCount && post.likes_count > 0 && (
                <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-neutral-900 text-white text-xs rounded-md whitespace-nowrap">
                  {post.likes_count} {post.likes_count === 1 ? 'like' : 'likes'}
                  <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-neutral-900 rotate-45"></div>
                </div>
              )}
            </div>

            {/* Comment Button */}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2.5 rounded-full text-neutral-500 hover:text-blue-500 hover:bg-blue-50 transition-all"
            >
              <MessageCircle className="w-4 h-4" />
            </Button>

            {/* Share Button */}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2.5 rounded-full text-neutral-500 hover:text-purple-500 hover:bg-purple-50 transition-all"
            >
              <Share className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
};