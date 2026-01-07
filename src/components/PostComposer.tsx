import { useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';

interface PostComposerProps {
  onPost: (content: string) => void;
}

export function PostComposer({ onPost }: PostComposerProps) {
  const [content, setContent] = useState('');

  const handleSubmit = () => {
    if (content.trim()) {
      onPost(content);
      setContent('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="bg-white border-b border-gray-200 p-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex gap-3">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Share something..."
            className="flex-1 min-h-[80px] resize-none border-gray-300 focus:border-gray-900 focus:ring-0 bg-white"
          />
        </div>

        <div className="flex justify-end mt-3">
          <Button
            onClick={handleSubmit}
            disabled={!content.trim()}
            size="sm"
            className="bg-gray-900 hover:bg-gray-800 text-white font-medium"
          >
            <Send className="h-4 w-4 mr-1.5" />
            Post
          </Button>
        </div>
      </div>
    </div>
  );
}
