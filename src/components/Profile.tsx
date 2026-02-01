import { useState, useEffect, useMemo } from 'react';
import { Button } from './ui-simple/Button';
import { TrendingUp, TrendingDown, ArrowLeft, LogOut, Heart, MessageCircle } from './ui-simple/Icons';
import { useAuth } from './AuthProvider';
import { useSocialFollow } from '../hooks/useSocialFollow';
import { apiService, type PostWithAuthor } from '../lib/api';

const MAX_SUPPLY = 30;

interface ProfileProps {
  user: any;
  onClose: () => void;
  onEditProfile?: () => void;
}

// Format number with k/m suffix
const formatCount = (count: number): string => {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}m`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return count.toString();
};

const calculateSharePriceSui = (x: number): number => {
  return 0.02 + 0.35 / (x + 3) + 1 / (38 - x);
};

// Mini sparkline chart component
function MiniChart({ data }: { data: { time: string; value: number }[] }) {
  if (data.length === 0) return null;

  const values = data.map(d => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const width = 80;
  const height = 24;
  const padding = 1;

  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * (width - padding * 2) + padding;
    const y = height - padding - ((d.value - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  const pathData = `M ${points.join(' L ')}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-20 h-6"
      preserveAspectRatio="none"
    >
      <path
        d={pathData}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// Format relative time from timestamp
const formatRelativeTime = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return 'now';
};

export function Profile({ user, onClose, onEditProfile }: ProfileProps) {
  const { signOut } = useAuth();
  const { userProfile } = useSocialFollow();

  // Posts from backend service
  const [posts, setPosts] = useState<PostWithAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const holderCount = Math.max(0, Math.min(MAX_SUPPLY, userProfile?.followerCount || 0));

  const chartData = useMemo(() => {
    const data = [];
    for (let i = 1; i <= MAX_SUPPLY; i++) {
      data.push({
        time: i.toString(),
        value: calculateSharePriceSui(i),
      });
    }
    return data;
  }, []);

  // holderCount represents current holders (includes creator, so >= 1 for existing market)
  // Show "price to follow" = buy price = price_mist(holders + 1)
  // When holderCount is 0 (no market yet), show price for first share
  const buyPrice = holderCount > 0 ? calculateSharePriceSui(holderCount + 1) : calculateSharePriceSui(1);
  const previousBuyPrice = holderCount > 0 ? calculateSharePriceSui(holderCount) : buyPrice;
  const priceChange = previousBuyPrice ? ((buyPrice - previousBuyPrice) / previousBuyPrice) * 100 : 0;

  // Get wallet address for display
  const walletAddress = user.wallet_address || '';
  const shortAddress = walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : user.username;

  // Get follower count
  const followerCount = userProfile?.followerCount || 0;

  // Fetch posts from backend service
  useEffect(() => {
    const fetchPosts = async () => {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      try {
        setError(null);
        const response = await apiService.getUserPosts(user.id);
        if (response.success && response.data) {
          setPosts(response.data);
        } else {
          setError(response.error || 'Failed to load posts');
        }
      } catch (err) {
        console.error('Failed to fetch posts:', err);
        setError('Failed to load posts');
      } finally {
        setLoading(false);
      }
    };

    fetchPosts();
  }, [user?.id]);

  const postCount = posts.length || user.posts_count || 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Back to feed"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>
          <h1 className="text-lg tracking-tight text-gray-900">Profile</h1>
          <button
            onClick={signOut}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Sign out"
          >
            <LogOut className="h-5 w-5 text-gray-600" />
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {/* Profile Info with integrated price */}
        <div className="bg-white border border-gray-100 p-6 mb-4">
          <div className="flex items-start gap-4">
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt="Avatar"
                className="w-16 h-16 rounded-full object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-cyan-400 flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <h2 className="font-medium text-gray-900 mb-1">{user.display_name || user.username}</h2>
              <p className="font-mono text-xs text-gray-500">{shortAddress}</p>
            </div>

            {/* Compact price display */}
            <div className="flex flex-col items-end">
              <div className="flex items-center gap-2 mb-1">
                <MiniChart data={chartData} />
              </div>
              <div className="text-right">
                <div className="font-mono text-sm text-gray-900">
                  {buyPrice.toFixed(4)} <span className="text-xs text-gray-500">SUI</span>
                </div>
                <div className={`flex items-center justify-end gap-0.5 text-xs ${priceChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {priceChange >= 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(1)}%
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <div>
                <span className="font-medium text-gray-900">{postCount}</span> posts
              </div>
              <div>
                <span className="font-medium text-gray-900">{formatCount(followerCount)}</span> holders
              </div>
            </div>
            <Button
              size="sm"
              onClick={onEditProfile}
              className="bg-gray-900 hover:bg-gray-800 text-white text-xs px-4"
            >
              Edit Profile
            </Button>
          </div>
        </div>

        {/* User's Posts */}
        <div className="bg-white border border-gray-100">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-medium text-gray-900">Posts</h3>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-500 text-sm">
              Loading posts...
            </div>
          ) : error ? (
            <div className="p-8 text-center text-red-500 text-sm">
              {error}
            </div>
          ) : posts.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">
              No posts yet. Share your first thought!
            </div>
          ) : (
            <div>
              {posts.map((post) => (
                <article key={post.id} className="bg-white border-b border-gray-100 py-4 px-4">
                  <div className="flex items-center gap-2 mb-2">
                    {user.avatar_url ? (
                      <img
                        src={user.avatar_url}
                        alt="Avatar"
                        className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-cyan-400 flex-shrink-0" />
                    )}
                    <span className="text-sm text-gray-600">
                      {user.username}
                    </span>
                    <span className="text-gray-500 text-sm">·</span>
                    <span className="text-gray-500 text-sm">
                      {formatRelativeTime(new Date(post.created_at).getTime())}
                    </span>
                  </div>

                  <p className="text-gray-800 mb-3 whitespace-pre-wrap break-words">
                    {post.content}
                  </p>

                  {post.media_urls && post.media_urls.length > 0 && (
                    <div className="mb-3">
                      <img
                        src={post.media_urls[0]}
                        alt="Post media"
                        className="w-full rounded border border-gray-200 max-h-96 object-cover"
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-5 text-gray-500">
                    <button className="flex items-center gap-1.5 hover:text-gray-900 transition-colors">
                      <Heart className="h-4 w-4" />
                      <span className="text-xs">{post.likes_count || 0}</span>
                    </button>
                    <button className="flex items-center gap-1.5 hover:text-gray-900 transition-colors">
                      <MessageCircle className="h-4 w-4" />
                      <span className="text-xs">{post.comments_count || 0}</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
