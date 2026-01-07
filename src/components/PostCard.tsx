import { Heart, MessageCircle, Share2 } from 'lucide-react';
import { useState } from 'react';

export interface Post {
  id: string;
  author: string;
  content: string;
  timestamp: string;
  likes: number;
  comments: number;
}

interface PostCardProps {
  post: Post;
}

export function PostCard({ post }: PostCardProps) {
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(post.likes);

  const handleLike = () => {
    if (liked) {
      setLikes(likes - 1);
    } else {
      setLikes(likes + 1);
    }
    setLiked(!liked);
  };

  return (
    <article className="bg-white border-b border-gray-100 py-4 px-4">
      {/* Author info */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-300 to-gray-400" />
        <span className="font-mono text-sm text-gray-900">{post.author}</span>
        <span className="text-gray-400">·</span>
        <span className="text-xs text-gray-500">{post.timestamp}</span>
      </div>

      {/* Content */}
      <p className="text-gray-800 mb-3 whitespace-pre-wrap">{post.content}</p>

      {/* Actions */}
      <div className="flex items-center gap-6 text-gray-500">
        <button
          onClick={handleLike}
          className={`flex items-center gap-1.5 transition-colors ${
            liked ? 'text-red-500' : 'hover:text-gray-900'
          }`}
        >
          <Heart className={`h-4 w-4 ${liked ? 'fill-current' : ''}`} />
          <span className="text-xs">{likes}</span>
        </button>
        <button className="flex items-center gap-1.5 hover:text-gray-900 transition-colors">
          <MessageCircle className="h-4 w-4" />
          <span className="text-xs">{post.comments}</span>
        </button>
        <button className="flex items-center gap-1.5 hover:text-gray-900 transition-colors">
          <Share2 className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
}
