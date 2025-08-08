import React, { useState, useEffect } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Avatar } from './ui/avatar';
import { Textarea } from './ui/textarea';
import { Alert, AlertDescription } from './ui/alert';
import { Heart, MessageCircle, Repeat2, Share, TrendingUp, Send, AlertCircle, Sparkles } from 'lucide-react';

interface SocialFeedProps {
  user: any;
}

export const SocialFeed: React.FC<SocialFeedProps> = ({ user }) => {
  const [posts, setPosts] = useState<any[]>([]);
  const [newPost, setNewPost] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    try {
      // Mock posts data - replace with real API
      const mockPosts = [
        {
          id: '1',
          content: 'Just launched my personal token! 🚀 $MEME is going to the moon! Who wants to buy in? #MemeFlow #ToTheMoon',
          author: {
            id: '1',
            username: 'cryptokid',
            avatar: null
          },
          created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(), // 30 mins ago
          likes: 42,
          comments: 12,
          reposts: 8,
          liked: false,
          token_mention: {
            symbol: 'MEME',
            price: 0.0012,
            change: +15.3
          }
        },
        {
          id: '2',
          content: 'Market is looking bullish today! My $HODL token is up 25% 📈 Time to celebrate with some memes!',
          author: {
            id: '2',
            username: 'moonlambo',
            avatar: null
          },
          created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
          likes: 156,
          comments: 34,
          reposts: 22,
          liked: true,
          token_mention: {
            symbol: 'HODL',
            price: 0.0089,
            change: +25.1
          }
        },
        {
          id: '3',
          content: 'Who else thinks we need more meme tokens in the ecosystem? The community is what makes these projects special! 🎭✨',
          author: {
            id: '3',
            username: 'memequeen',
            avatar: null
          },
          created_at: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(), // 4 hours ago
          likes: 89,
          comments: 45,
          reposts: 15,
          liked: false
        }
      ];
      setPosts(mockPosts);
    } catch (error) {
      console.error('Failed to fetch posts:', error);
      setError('Failed to load posts');
    }
  };

  const handleCreatePost = async () => {
    if (!newPost.trim()) return;
    
    setLoading(true);
    try {
      // Mock post creation - replace with real API
      const newPostObj = {
        id: Date.now().toString(),
        content: newPost,
        author: {
          id: user.id,
          username: user.username,
          avatar: user.avatar
        },
        created_at: new Date().toISOString(),
        likes: 0,
        comments: 0,
        reposts: 0,
        liked: false
      };
      
      setPosts([newPostObj, ...posts]);
      setNewPost('');
    } catch (error) {
      setError('Failed to create post');
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async (postId: string) => {
    setPosts(posts.map(post => 
      post.id === postId 
        ? { 
            ...post, 
            liked: !post.liked, 
            likes: post.liked ? post.likes - 1 : post.likes + 1 
          }
        : post
    ));
  };

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 60) {
      return `${diffInMinutes}m`;
    } else if (diffInMinutes < 1440) {
      return `${Math.floor(diffInMinutes / 60)}h`;
    } else {
      return `${Math.floor(diffInMinutes / 1440)}d`;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-transparent bg-gradient-to-r from-cyan-400 via-pink-400 to-purple-400 bg-clip-text">
          Social Feed
        </h2>
        <div className="flex items-center space-x-2 text-sm text-white/60">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <span>Live updates</span>
        </div>
      </div>

      {error && (
        <Alert className="border-red-500 bg-red-500/10">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription className="text-red-400">{error}</AlertDescription>
        </Alert>
      )}

      {/* Create Post */}
      <Card className="glass border border-white/10 p-6">
        <div className="flex space-x-4">
          <Avatar className="w-12 h-12 bg-gradient-to-r from-cyan-400 to-purple-400 flex items-center justify-center">
            <span className="text-white font-bold">
              {user.username ? user.username[0].toUpperCase() : 'U'}
            </span>
          </Avatar>
          <div className="flex-1">
            <Textarea
              placeholder="What's happening in the meme verse?"
              value={newPost}
              onChange={(e) => setNewPost(e.target.value)}
              className="bg-white/5 border-white/20 text-white placeholder-white/50 min-h-[100px] resize-none"
              maxLength={280}
            />
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-white/60">
                {280 - newPost.length} characters remaining
              </span>
              <Button
                onClick={handleCreatePost}
                disabled={!newPost.trim() || loading}
                className="bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-600 hover:to-pink-600"
              >
                <Send className="w-4 h-4 mr-2" />
                {loading ? 'Posting...' : 'Post'}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Posts */}
      <div className="space-y-4">
        {posts.map((post) => (
          <Card key={post.id} className="glass border border-white/10 p-6 hover:border-white/20 transition-all duration-300">
            <div className="flex space-x-4">
              <Avatar className="w-12 h-12 bg-gradient-to-r from-cyan-400 to-purple-400 flex items-center justify-center">
                <span className="text-white font-bold">
                  {post.author.username[0].toUpperCase()}
                </span>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="font-semibold text-white">@{post.author.username}</span>
                  <span className="text-white/50 text-sm">·</span>
                  <span className="text-white/50 text-sm">{formatTimeAgo(post.created_at)}</span>
                </div>
                
                <p className="text-white/90 mb-4 leading-relaxed">{post.content}</p>
                
                {post.token_mention && (
                  <Card className="glass border border-white/10 p-3 mb-4 bg-gradient-to-r from-cyan-500/10 to-pink-500/10">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <TrendingUp className="w-5 h-5 text-cyan-400" />
                        <span className="font-semibold text-white">${post.token_mention.symbol}</span>
                      </div>
                      <div className="flex items-center space-x-4">
                        <span className="text-white/70">${post.token_mention.price.toFixed(4)}</span>
                        <span className={`text-sm px-2 py-1 rounded ${
                          post.token_mention.change > 0 
                            ? 'text-green-400 bg-green-500/20' 
                            : 'text-red-400 bg-red-500/20'
                        }`}>
                          {post.token_mention.change > 0 ? '+' : ''}{post.token_mention.change.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </Card>
                )}
                
                <div className="flex items-center justify-between text-white/60">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleLike(post.id)}
                    className={`hover:bg-pink-500/20 hover:text-pink-400 ${
                      post.liked ? 'text-pink-400' : ''
                    }`}
                  >
                    <Heart className={`w-4 h-4 mr-1 ${post.liked ? 'fill-current' : ''}`} />
                    {post.likes}
                  </Button>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    className="hover:bg-cyan-500/20 hover:text-cyan-400"
                  >
                    <MessageCircle className="w-4 h-4 mr-1" />
                    {post.comments}
                  </Button>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    className="hover:bg-green-500/20 hover:text-green-400"
                  >
                    <Repeat2 className="w-4 h-4 mr-1" />
                    {post.reposts}
                  </Button>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    className="hover:bg-purple-500/20 hover:text-purple-400"
                  >
                    <Share className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
      
      {posts.length === 0 && (
        <Card className="glass border border-white/10 p-12 text-center">
          <Sparkles className="w-16 h-16 text-white/30 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white/70 mb-2">No posts yet</h3>
          <p className="text-white/50">Be the first to share something in the meme verse!</p>
        </Card>
      )}
    </div>
  );
};