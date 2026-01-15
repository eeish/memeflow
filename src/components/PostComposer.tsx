import { useState, useRef } from 'react';
import { Send, Image as ImageIcon, Video, X } from 'lucide-react';
import { Button } from './ui-simple/Button';
import { Textarea } from './ui-simple/Textarea';
import { apiService } from '../lib/api';
import { useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { useContractAddresses } from '../hooks/useContractsSocial';
import { encodePostContent } from '../lib/postEncoding';

interface MediaItem {
  id: string;
  file: File;
  preview: string;
  type: 'image' | 'video';
}

interface PostComposerProps {
  onPost: (content: string, attachment?: { type: 'image' | 'video'; url: string }) => void;
}

export function PostComposer({ onPost }: PostComposerProps) {
  const [content, setContent] = useState('');
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const account = useCurrentAccount();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const { packageId } = useContractAddresses();

  const publishOnChain = async (payload: string) => {
    if (!account?.address) {
      throw new Error('Please connect your wallet to publish');
    }

    if (!packageId || packageId === '0x0' || packageId === '0x0000000000000000000000000000000000000000000000000000000000000000') {
      throw new Error('Contracts not deployed for this network');
    }

    const tx = new Transaction();
    const payloadBytes = bcs
      .vector(bcs.u8())
      .serialize(Array.from(new TextEncoder().encode(payload)));

    tx.moveCall({
      target: `${packageId}::memeflow_social::emit_post`,
      arguments: [tx.pure(payloadBytes)],
    });

    await new Promise<void>((resolve, reject) => {
      signAndExecute(
        {
          transaction: tx,
          options: {
            showEffects: true,
            showEvents: true,
          },
        },
        {
          onSuccess: () => resolve(),
          onError: (error) => reject(error),
        }
      );
    });
  };

  const handleSubmit = async () => {
    if (!content.trim() && media.length === 0) {
      return;
    }

    setUploadError(null);

    if (!account?.address) {
      setUploadError('Please connect your wallet to publish');
      return;
    }

    let attachment: { type: 'image' | 'video'; url: string } | undefined;
    setIsUploading(true);

    // If media is attached, upload to R2 first
    if (media.length > 0) {
      console.log('🚀 PostComposer upload start:', {
        userId: account.address,
        fileCount: media.length,
        files: media.map(m => ({name: m.file.name, type: m.file.type, size: m.file.size}))
      });
      console.log('📤 Uploading', media.length, 'files to R2...');

      try {
        // Upload files to R2
        const uploadResult = await apiService.batchUploadMedia(
          media.map(m => m.file),
          account.address
        );
        console.log('📥 Upload response:', uploadResult);

        if (!uploadResult.success || !uploadResult.data || uploadResult.data.length === 0) {
          throw new Error(uploadResult.error || 'Upload failed');
        }

        console.log('✅ Upload successful:', uploadResult.data);

        const firstFile = uploadResult.data[0];
        const firstMedia = media[0];
        attachment = {
          type: firstMedia.type,
          url: firstFile.public_url,
        };
      } catch (error: any) {
        console.error('❌ Upload failed:', error);
        setUploadError(error.message || 'Failed to upload media');
        setIsUploading(false);
        return;
      }
    }

    try {
      const payload = encodePostContent(content, attachment?.url);
      await publishOnChain(payload);
      onPost(content, attachment);
    } catch (error: any) {
      console.error('❌ Post publish failed:', error);
      setUploadError(error?.message || 'Failed to publish post');
      setIsUploading(false);
      return;
    }

    // Clear form
    setContent('');
    // Revoke object URLs to prevent memory leaks
    media.forEach(item => URL.revokeObjectURL(item.preview));
    setMedia([]);
    setIsUploading(false);
    if (imageInputRef.current) imageInputRef.current.value = '';
    if (videoInputRef.current) videoInputRef.current.value = '';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newFiles = Array.from(files);

    // Check max files limit (9 total)
    if (media.length + newFiles.length > 9) {
      alert('Maximum 9 files per post');
      return;
    }

    // Create MediaItem for each file
    const newMediaItems: MediaItem[] = await Promise.all(
      newFiles.map(async (file) => {
        const preview = URL.createObjectURL(file);
        return {
          id: `${Date.now()}-${Math.random()}`,
          file,
          preview,
          type: file.type.startsWith('video/') ? 'video' as const : 'image' as const,
        };
      })
    );

    setMedia([...media, ...newMediaItems]);
  };

  const handleVideoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newFiles = Array.from(files);

    // Check max files limit (9 total)
    if (media.length + newFiles.length > 9) {
      alert('Maximum 9 files per post');
      return;
    }

    // Create MediaItem for each file
    const newMediaItems: MediaItem[] = await Promise.all(
      newFiles.map(async (file) => {
        const preview = URL.createObjectURL(file);
        return {
          id: `${Date.now()}-${Math.random()}`,
          file,
          preview,
          type: 'video' as const,
        };
      })
    );

    setMedia([...media, ...newMediaItems]);
  };

  const removeMedia = (id: string) => {
    const item = media.find(m => m.id === id);
    if (item) {
      URL.revokeObjectURL(item.preview);
    }
    setMedia(media.filter(m => m.id !== id));
  };

  const canPost = (content.trim() || media.length > 0) && !isUploading;

  return (
    <div className="bg-white border-b border-gray-200 p-4">
      <div className="max-w-3xl mx-auto">
        {/* Upload Error */}
        {uploadError && (
          <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
            {uploadError}
          </div>
        )}

        <div className="flex gap-3">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Share something..."
            className="flex-1 min-h-[80px] resize-none border-gray-300 focus:border-gray-900 focus:ring-0"
            disabled={isUploading}
          />
        </div>

        {/* Media Preview - Small Thumbnails */}
        {media.length > 0 && (
          <div className="mt-3">
            <div className={`flex flex-wrap gap-2 ${media.length > 4 ? 'max-h-32' : ''}`}>
              {media.map((item) => (
                <div
                  key={item.id}
                  className="relative group"
                  style={{
                    width: media.length === 1 ? '200px' : media.length <= 4 ? '120px' : '80px',
                    height: media.length === 1 ? '200px' : media.length <= 4 ? '120px' : '80px'
                  }}
                >
                  {item.type === 'image' ? (
                    <img
                      src={item.preview}
                      alt="Preview"
                      className="w-full h-full object-cover rounded border border-gray-200"
                    />
                  ) : (
                    <div className="relative w-full h-full">
                      <video
                        src={item.preview}
                        className="w-full h-full object-cover rounded border border-gray-200"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded">
                        <Video className="h-6 w-6 text-white" />
                      </div>
                    </div>
                  )}
                  <button
                    onClick={() => removeMedia(item.id)}
                    className="absolute -top-2 -right-2 p-1 bg-gray-900 text-white rounded-full hover:bg-gray-800 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Remove"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            <div className="text-xs text-gray-500 mt-2">
              {media.length} {media.length === 1 ? 'file' : 'files'} ready to upload
            </div>
          </div>
        )}

        {isUploading && (
          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800 flex items-center">
            <div className="w-4 h-4 border-2 border-blue-800/30 border-t-blue-800 rounded-full animate-spin mr-2"></div>
            Uploading {media.length} {media.length === 1 ? 'file' : 'files'} to cloud storage...
          </div>
        )}

        <div className="flex items-center justify-between mt-3">
          {/* Attachment Buttons */}
          <div className="flex gap-2">
            <input
              ref={imageInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
              onChange={handleImageSelect}
              multiple
              className="hidden"
            />
            <input
              ref={videoInputRef}
              type="file"
              accept="video/mp4,video/webm"
              onChange={handleVideoSelect}
              multiple
              className="hidden"
            />

            <button
              onClick={() => imageInputRef.current?.click()}
              disabled={media.length >= 9 || isUploading}
              className={`p-2 rounded hover:bg-gray-100 transition-colors ${
                media.length >= 9 || isUploading ? 'opacity-40 cursor-not-allowed' : ''
              }`}
              aria-label="Attach images"
            >
              <ImageIcon className="h-5 w-5 text-gray-600" />
            </button>

            <button
              onClick={() => videoInputRef.current?.click()}
              disabled={media.length >= 9 || isUploading}
              className={`p-2 rounded hover:bg-gray-100 transition-colors ${
                media.length >= 9 || isUploading ? 'opacity-40 cursor-not-allowed' : ''
              }`}
              aria-label="Attach videos"
            >
              <Video className="h-5 w-5 text-gray-600" />
            </button>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!canPost}
            size="sm"
            className="bg-gray-900 hover:bg-gray-800"
          >
            {isUploading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-1.5"></div>
                Uploading...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-1.5" />
                Post
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
