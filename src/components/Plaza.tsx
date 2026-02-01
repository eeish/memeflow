import React, { useState, useEffect } from 'react';
import { PostComposer } from './PostComposer';
import { FeedTabs } from './FeedTabs';
import { Alert, AlertDescription } from './ui-simple/Alert';
import { AlertCircle } from './ui-simple/Icons';
import { FeedPostCard } from './feed/FeedPostCard';
import type { FeedPostItem } from './feed/types';
import { formatTimeAgo, inferMediaType } from '../lib/feed';

interface PlazaProps {
  user: any;
  onNavigateToProfile?: (author: any) => void;
}

// Mock posts for now
const mockPosts: FeedPostItem[] = [
  {
    id: '1',
    author: {
      username: 'alice',
    },
    content: 'Just exploring this new decentralized social platform. The privacy-first approach is refreshing.',
    timestamp: '2h',
    likesCount: 12,
    commentsCount: 3,
  },
  {
    id: '2',
    author: {
      username: 'bob',
    },
    content: 'The minimalist design here is perfect. No clutter, just content.',
    timestamp: '4h',
    likesCount: 8,
    commentsCount: 1,
  },
  {
    id: '3',
    author: {
      username: 'charlie',
    },
    content: 'Love the bonding curve economics for following. Interesting incentive model.',
    timestamp: '6h',
    likesCount: 15,
    commentsCount: 2,
  },
];

export const Plaza: React.FC<PlazaProps> = ({ user, onNavigateToProfile }) => {
  const [posts, setPosts] = useState<FeedPostItem[]>(mockPosts);
  const [activeTab, setActiveTab] = useState<'trending' | 'following'>('trending');
  const [error, setError] = useState<string | null>(null);

  // Try to fetch from backend, but gracefully fall back to mock data
  useEffect(() => {
    const fetchPlazaPosts = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/plaza?limit=50&offset=0');
        const data = await response.json();

        if (data.success && data.data && data.data.length > 0) {
          // Convert backend posts to our Post format
          const convertedPosts: FeedPostItem[] = data.data.map((p: any) => {
            const mediaUrls = Array.isArray(p.media_urls) ? p.media_urls : [];
            return {
              id: p.id,
              author: {
                id: p.author.id,
                username: p.author.username,
                displayName: p.author.display_name,
                avatarUrl: p.author.avatar_url,
                bio: p.author.bio,
                tokenSymbol: p.author.token_symbol,
                walletAddress: p.author.wallet_address,
                followersCount: p.author.followers_count,
                holdersCount: p.author.followers_count,
              },
              content: p.content,
              timestamp: formatTimeAgo(p.created_at),
              likesCount: p.likes_count || 0,
              commentsCount: p.comments_count || 0,
              media: mediaUrls.map((url: string) => ({ type: inferMediaType(url), url })),
            };
          });
          setPosts(convertedPosts);
        }
      } catch (err) {
        console.log('Backend not available, using mock data');
        // Keep using mock data
      }
    };

    fetchPlazaPosts();
  }, []);

  const handleNewPost = (content: string, attachment?: { type: 'image' | 'video'; url: string; blobId?: string }) => {
    const newPost: FeedPostItem = {
      id: Date.now().toString(),
      author: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        bio: user.bio,
        tokenSymbol: user.token_symbol,
        walletAddress: user.wallet_address,
        followersCount: user.followers_count,
        holdersCount: user.followers_count,
      },
      content,
      timestamp: 'now',
      likesCount: 0,
      commentsCount: 0,
      media: attachment ? [{ type: attachment.type, url: attachment.url }] : undefined,
    };
    setPosts([newPost, ...posts]);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="pb-20">
        <PostComposer onPost={handleNewPost} />
        <FeedTabs activeTab={activeTab} onTabChange={setActiveTab} />

        <div className="max-w-3xl mx-auto bg-white">
          {error && (
            <div className="p-4">
              <Alert className="border-red-200 bg-red-50">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <AlertDescription className="text-red-700">{error}</AlertDescription>
              </Alert>
            </div>
          )}

          {posts.map((post) => (
            <FeedPostCard
              key={post.id}
              post={post}
              tone="light"
              onAuthorClick={onNavigateToProfile}
            />
          ))}

          {/* Empty state */}
          {posts.length === 0 && (
            <div className="py-20 text-center text-gray-400">
              <p>No posts yet. Be the first to share something.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
