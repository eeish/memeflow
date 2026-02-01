import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { UserPlus, UserMinus, ShoppingCart, Loader2 } from './ui-simple/Icons';
import { Avatar, AvatarFallback, AvatarImage } from './ui-simple/Avatar';
import { Card } from './ui-simple/Card';
import type { UserSummary } from '../types/users.ts';
import { apiService, type PostWithAuthor, type User } from '../lib/api';
import type { FeedPostItem } from './feed/types';
import { FeedPostCard } from './feed/FeedPostCard';
import { formatTimeAgo, inferMediaType } from '../lib/feed';
import { calculatePriceMist, formatMistToSui } from '../hooks/useSocialFollow';
import { useAuth } from './AuthProvider';

interface UserProfilePageProps {
  user: UserSummary;
}

export const UserProfilePage: React.FC<UserProfilePageProps> = ({ user }) => {
  const displayName = user.display_name?.trim() || `@${user.username}`;
  const avatarFallback = user.username.charAt(0).toUpperCase();
  const normalizedDisplay = displayName.replace(/^@/, '').toLowerCase();
  const normalizedUsername = user.username.toLowerCase();
  const showHandle = Boolean(user.display_name) && normalizedDisplay !== normalizedUsername;
  const [posts, setPosts] = useState<PostWithAuthor[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [postsError, setPostsError] = useState<string | null>(null);

  // Full profile data (for bio, wallet address, etc.)
  const [fullProfile, setFullProfile] = useState<User | null>(null);

  // Follow/Buy Share state
  const { user: currentUser } = useAuth();
  const [isFollowing, setIsFollowing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [followError, setFollowError] = useState<string | null>(null);

  // Check if viewing own profile
  const isOwnProfile = currentUser?.id === user.id;

  // Get holders count from full profile or default to 0
  const holdersCount = fullProfile?.followers_count ?? 0;

  // Calculate share price
  const sharePrice = useMemo(() => {
    const mist = calculatePriceMist(holdersCount + 1);
    return formatMistToSui(mist);
  }, [holdersCount]);

  // Check follow status when component mounts or user changes
  useEffect(() => {
    if (!user.id || !currentUser?.id || isOwnProfile) return;

    const checkFollowStatus = async () => {
      try {
        const response = await apiService.getFollowStatus(user.id, currentUser.id);
        if (response.success && response.data) {
          setIsFollowing(response.data.is_following);
        }
      } catch (err) {
        console.error('Failed to check follow status:', err);
      }
    };

    checkFollowStatus();
  }, [user.id, currentUser?.id, isOwnProfile]);

  // Handle follow action (social follow - does NOT affect holder count or share price)
  const handleFollow = useCallback(async () => {
    if (!user.id || !currentUser?.id || isOwnProfile) return;

    setActionLoading(true);
    setFollowError(null);
    try {
      const response = await apiService.followUser(user.id, currentUser.id);
      if (response.success) {
        setIsFollowing(true);
      } else {
        setFollowError(response.error || 'Failed to follow');
        console.error('Follow failed:', response.error);
      }
    } catch (err) {
      console.error('Follow failed:', err);
      setFollowError('Failed to follow');
    } finally {
      setActionLoading(false);
    }
  }, [user.id, currentUser?.id, isOwnProfile]);

  // Handle unfollow action (social unfollow - does NOT affect holder count or share price)
  const handleUnfollow = useCallback(async () => {
    if (!user.id || !currentUser?.id) return;

    setActionLoading(true);
    setFollowError(null);
    try {
      const response = await apiService.unfollowUser(user.id, currentUser.id);
      if (response.success) {
        setIsFollowing(false);
      } else {
        setFollowError(response.error || 'Failed to unfollow');
        console.error('Unfollow failed:', response.error);
      }
    } catch (err) {
      console.error('Unfollow failed:', err);
      setFollowError('Failed to unfollow');
    } finally {
      setActionLoading(false);
    }
  }, [user.id, currentUser?.id]);

  // Handle buy share action (placeholder - requires on-chain transaction in Phase 2)
  const handleBuyShare = useCallback(async () => {
    // TODO: Implement on-chain share purchase transaction
    // This will affect holder count and share price via bonding curve
    setFollowError('Share trading coming soon');
  }, []);

  // Fetch full profile data
  useEffect(() => {
    let isMounted = true;
    const fetchFullProfile = async () => {
      try {
        const response = await apiService.getUser(user.id);
        if (!isMounted) return;
        if (response.success && response.data) {
          setFullProfile(response.data);
        }
      } catch (error) {
        if (!isMounted) return;
        console.error('Failed to fetch full profile:', error);
      }
    };

    fetchFullProfile();
    return () => {
      isMounted = false;
    };
  }, [user.id]);

  // Fetch user posts
  useEffect(() => {
    let isMounted = true;
    const fetchUserPosts = async () => {
      try {
        setLoadingPosts(true);
        setPostsError(null);
        const response = await apiService.getUserPosts(user.id, 50, 0);
        if (!isMounted) return;
        if (response.success && response.data) {
          setPosts(response.data);
        } else {
          setPostsError(response.error || 'Failed to load posts');
        }
      } catch (error) {
        if (!isMounted) return;
        console.error('Failed to fetch user posts:', error);
        setPostsError('Failed to load posts');
      } finally {
        if (isMounted) setLoadingPosts(false);
      }
    };

    fetchUserPosts();
    return () => {
      isMounted = false;
    };
  }, [user.id]);

  return (
    <div className="space-y-6">
      <Card className="border border-gray-200 bg-white p-6">
        <div className="flex items-start gap-4">
          <Avatar className="h-16 w-16">
            {user.avatar_url ? (
              <AvatarImage src={user.avatar_url} alt={displayName} />
            ) : (
              <AvatarFallback className="bg-gray-200 text-lg font-semibold text-gray-700">
                {avatarFallback}
              </AvatarFallback>
            )}
          </Avatar>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-gray-900">{displayName}</h1>
            {showHandle && <p className="text-sm text-gray-500">@{user.username}</p>}
            {fullProfile?.wallet_address && (
              <p className="mt-1 font-mono text-xs text-gray-400 tracking-wide">
                {fullProfile.wallet_address.slice(0, 6)}
                <span className="mx-0.5 text-gray-300">···</span>
                {fullProfile.wallet_address.slice(-4)}
              </p>
            )}
          </div>
        </div>

        {/* Bio */}
        {fullProfile?.bio && (
          <p className="mt-4 text-sm text-gray-600 leading-relaxed">
            {fullProfile.bio}
          </p>
        )}

        {/* Stats */}
        <div className="mt-4 flex items-center gap-6 text-sm">
          <div>
            <span className="font-semibold text-gray-900">{holdersCount}</span>
            <span className="ml-1 text-gray-500">holders</span>
          </div>
          <div>
            <span className="font-semibold text-cyan-600">{sharePrice} SUI</span>
            <span className="ml-1 text-gray-500">/ share</span>
          </div>
          <div>
            <span className="font-semibold text-gray-900">{posts.length}</span>
            <span className="ml-1 text-gray-500">posts</span>
          </div>
        </div>

        {/* Action Buttons - only show for non-own profile when logged in */}
        {!isOwnProfile && currentUser && (
          <div className="mt-4 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <button
                onClick={isFollowing ? handleUnfollow : handleFollow}
                disabled={actionLoading}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors disabled:opacity-50 ${
                  isFollowing
                    ? 'border border-gray-200 text-gray-600 hover:bg-red-50 hover:border-red-300 hover:text-red-600'
                    : 'bg-gray-900 text-white hover:bg-gray-800'
                }`}
              >
                {actionLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : isFollowing ? (
                  <>
                    <UserMinus className="w-3 h-3" />
                    Following
                  </>
                ) : (
                  <>
                    <UserPlus className="w-3 h-3" />
                    Follow
                  </>
                )}
              </button>
              <button
                onClick={handleBuyShare}
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-purple-200 text-purple-600 hover:bg-purple-50 hover:border-purple-300 transition-colors disabled:opacity-50"
              >
                {actionLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <>
                    <ShoppingCart className="w-3 h-3" />
                    Buy Share
                  </>
                )}
              </button>
            </div>
            {followError && (
              <p className="text-xs text-red-500">{followError}</p>
            )}
          </div>
        )}

      </Card>

      <div className="max-w-3xl mx-auto bg-white">
        {loadingPosts ? (
          <div className="p-6 text-sm text-gray-500 text-center">Loading posts...</div>
        ) : postsError ? (
          <div className="p-6 text-sm text-red-500 text-center">{postsError}</div>
        ) : posts.length === 0 ? (
          <div className="p-6 text-sm text-gray-500 text-center">
            Posts from @{user.username} will appear here once published.
          </div>
        ) : (
          posts.map((post) => {
            const mediaUrls = Array.isArray(post.media_urls) ? post.media_urls : [];
            const feedPost: FeedPostItem = {
              id: post.id,
              author: {
                id: post.author_id,
                username: post.author.username,
                displayName: post.author.display_name,
                avatarUrl: post.author.avatar_url,
                bio: post.author.bio,
                tokenSymbol: post.author.token_symbol,
                walletAddress: post.author.wallet_address,
                followersCount: post.author.followers_count,
                holdersCount: post.author.followers_count,
              },
              content: post.content,
              timestamp: formatTimeAgo(post.created_at),
              likesCount: post.likes_count || 0,
              commentsCount: post.comments_count || 0,
              media: mediaUrls.map((url) => ({ type: inferMediaType(url), url })),
            };

            return <FeedPostCard key={post.id} post={feedPost} tone="light" />;
          })
        )}
      </div>
    </div>
  );
};
