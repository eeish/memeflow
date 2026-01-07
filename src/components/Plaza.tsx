import React, { useState, useEffect } from 'react';
import { PostComposer } from './PostComposer';
import { PostCard, type Post } from './PostCard';
import { FeedTabs } from './FeedTabs';
import { Alert, AlertDescription } from './ui/alert';
import { AlertCircle } from 'lucide-react';

interface PlazaProps {
  user: any;
  onNavigateToProfile?: (author: any) => void;
}

// Mock posts for now
const mockPosts: Post[] = [
  {
    id: '1',
    author: '@alice',
    content: 'Just exploring this new decentralized social platform. The privacy-first approach is refreshing.',
    timestamp: '2h',
    likes: 12,
    comments: 3,
  },
  {
    id: '2',
    author: '@bob',
    content: 'The minimalist design here is perfect. No clutter, just content.',
    timestamp: '4h',
    likes: 8,
    comments: 1,
  },
  {
    id: '3',
    author: '@charlie',
    content: 'Love the bonding curve economics for following. Interesting incentive model.',
    timestamp: '6h',
    likes: 15,
    comments: 2,
  },
];

export const Plaza: React.FC<PlazaProps> = ({ user, onNavigateToProfile }) => {
  const [posts, setPosts] = useState<Post[]>(mockPosts);
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
          const convertedPosts: Post[] = data.data.map((p: any) => ({
            id: p.id,
            author: `@${p.author.username}`,
            content: p.content,
            timestamp: formatTimeAgo(p.created_at),
            likes: p.likes_count || 0,
            comments: p.comments_count || 0,
          }));
          setPosts(convertedPosts);
        }
      } catch (err) {
        console.log('Backend not available, using mock data');
        // Keep using mock data
      }
    };

    fetchPlazaPosts();
  }, []);

  const formatTimeAgo = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return 'now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  };

  const handleNewPost = (content: string) => {
    const newPost: Post = {
      id: Date.now().toString(),
      author: `@${user.username}`,
      content,
      timestamp: 'now',
      likes: 0,
      comments: 0,
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
            <PostCard key={post.id} post={post} />
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
