import { useState, useRef } from 'react';
import { Send, Image, Video, X } from 'lucide-react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';

interface PostComposerProps {
  onPost: (content: string, attachment?: { type: 'image' | 'video'; url: string }) => void;
}

type AttachmentType = 'image' | 'video' | null;

export function PostComposer({ onPost }: PostComposerProps) {
  const [content, setContent] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentType, setAttachmentType] = useState<AttachmentType>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    if (content.trim() || attachmentPreview) {
      const attachmentData = attachmentPreview && attachmentType
        ? { type: attachmentType, url: attachmentPreview }
        : undefined;
      
      onPost(content, attachmentData);
      setContent('');
      
      // Don't clear attachment preview URL yet - it will be used in the post
      // Just reset the state
      setAttachment(null);
      setAttachmentType(null);
      setAttachmentPreview(null);
      if (imageInputRef.current) imageInputRef.current.value = '';
      if (videoInputRef.current) videoInputRef.current.value = '';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setAttachment(file);
      setAttachmentType('image');
      setAttachmentPreview(URL.createObjectURL(file));
    }
  };

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('video/')) {
      setAttachment(file);
      setAttachmentType('video');
      setAttachmentPreview(URL.createObjectURL(file));
    }
  };

  const clearAttachment = () => {
    if (attachmentPreview) {
      URL.revokeObjectURL(attachmentPreview);
    }
    setAttachment(null);
    setAttachmentType(null);
    setAttachmentPreview(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
    if (videoInputRef.current) videoInputRef.current.value = '';
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
            className="flex-1 min-h-[80px] resize-none border-gray-300 focus:border-gray-900 focus:ring-0"
          />
        </div>

        {/* Attachment Preview */}
        {attachmentPreview && (
          <div className="mt-3 relative inline-block">
            {attachmentType === 'image' && (
              <img
                src={attachmentPreview}
                alt="Preview"
                className="max-h-64 rounded border border-gray-200"
              />
            )}
            {attachmentType === 'video' && (
              <video
                src={attachmentPreview}
                controls
                className="max-h-64 rounded border border-gray-200"
              />
            )}
            <button
              onClick={clearAttachment}
              className="absolute -top-2 -right-2 p-1 bg-gray-900 text-white rounded-full hover:bg-gray-800"
              aria-label="Remove attachment"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        
        <div className="flex items-center justify-between mt-3">
          {/* Attachment Buttons */}
          <div className="flex gap-2">
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
            />
            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              onChange={handleVideoSelect}
              className="hidden"
            />
            
            <button
              onClick={() => imageInputRef.current?.click()}
              disabled={attachmentType === 'video'}
              className={`p-2 rounded hover:bg-gray-100 transition-colors ${
                attachmentType === 'video' ? 'opacity-40 cursor-not-allowed' : ''
              }`}
              aria-label="Attach image"
            >
              <Image className="h-5 w-5 text-gray-600" />
            </button>
            
            <button
              onClick={() => videoInputRef.current?.click()}
              disabled={attachmentType === 'image'}
              className={`p-2 rounded hover:bg-gray-100 transition-colors ${
                attachmentType === 'image' ? 'opacity-40 cursor-not-allowed' : ''
              }`}
              aria-label="Attach video"
            >
              <Video className="h-5 w-5 text-gray-600" />
            </button>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!content.trim() && !attachmentPreview}
            size="sm"
            className="bg-gray-900 hover:bg-gray-800"
          >
            <Send className="h-4 w-4 mr-1.5" />
            Post
          </Button>
        </div>
      </div>
    </div>
  );
}