import { useState, useRef } from 'react';
import { Send, Image as ImageIcon, Video, X } from './ui-simple/Icons';
import { Button } from './ui-simple/Button';
import { Textarea } from './ui-simple/Textarea';
import { apiService } from '../lib/api';
import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { useContractAddresses } from '../hooks/useContractsSocial';
import { useAuth } from './AuthProvider';
import { useActiveAddress } from '../hooks/useActiveAddress';
import { useTransactionExecutor } from '../hooks/useTransactionExecutor';
import { computeContentHash, hashToBytes } from '../lib/postHash';

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
  const [isSigning, setIsSigning] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const activeAddress = useActiveAddress();
  const { user } = useAuth();
  const { executeTransaction } = useTransactionExecutor();
  const { packageId } = useContractAddresses();

  /**
   * Sign and execute on-chain attestation.
   *
   * IMPORTANT: This must be called BEFORE uploading content or creating the post
   * in the database. If the user rejects the signature, no content should be sent.
   *
   * Hash = SHA256(author[32] || timestamp_ms[8 BE] || content[*])
   *
   * @param contentHash - Pre-computed content hash (hex string)
   * @param timestampMs - Timestamp used in hash computation
   * @param postId - Placeholder post ID (will be replaced with actual ID after DB creation)
   */
  const signAndPublishOnChain = async (
    contentHash: string,
    timestampMs: number,
    postId: string
  ): Promise<void> => {
    if (!activeAddress) {
      throw new Error('Please sign in to publish');
    }

    if (!packageId || packageId === '0x0' || packageId === '0x0000000000000000000000000000000000000000000000000000000000000000') {
      throw new Error('Contracts not deployed for this network');
    }

    const tx = new Transaction();

    // Convert hash to bytes for Move contract
    const contentHashBytes = bcs
      .vector(bcs.u8())
      .serialize(hashToBytes(contentHash));

    // Convert post ID to bytes
    const postIdBytes = bcs
      .vector(bcs.u8())
      .serialize(Array.from(new TextEncoder().encode(postId)));

    tx.moveCall({
      target: `${packageId}::cord_social::emit_post`,
      arguments: [
        tx.pure(contentHashBytes),    // content_hash: vector<u8>
        tx.pure.u64(timestampMs),     // timestamp_ms: u64
        tx.pure(postIdBytes),         // post_id: vector<u8>
      ],
    });

    // Use mutateAsync for proper Promise handling - no retry on rejection
    await executeTransaction({
      transaction: tx,
      options: {
        showEffects: true,
        showEvents: true,
      },
    });
  };

  const handleSubmit = async () => {
    // Prevent double submission
    if (isSigning || isUploading) {
      return;
    }

    if (!content.trim() && media.length === 0) {
      return;
    }

    setUploadError(null);

    if (!activeAddress) {
      setUploadError('Please sign in to publish');
      return;
    }

    if (!user?.id) {
      setUploadError('Please sign in to publish');
      return;
    }

    setIsSigning(true);

    // =========================================================================
    // ATOMIC PUBLISH FLOW
    //
    // The signature step MUST happen FIRST before any content is uploaded.
    // If the user rejects the signature, NO content should be sent anywhere.
    //
    // Flow:
    // 1. Compute hash client-side
    // 2. Sign and publish on-chain (user can reject here - nothing sent yet)
    // 3. Only after signing succeeds: upload media to R2
    // 4. Only after upload succeeds: create post in database
    // =========================================================================

    const trimmedContent = content.trim();
    const timestampMs = Date.now();
    const tempPostId = `pending-${timestampMs}`; // Placeholder ID for on-chain event

    try {
      // Step 1: Compute content hash client-side
      console.log('🔐 Computing content hash...');
      const contentHash = await computeContentHash(
        activeAddress,
        timestampMs,
        trimmedContent
      );
      console.log('✅ Hash computed:', contentHash);

      // Step 2: Sign and publish on-chain FIRST
      // If user rejects signature, this throws and we stop immediately
      // NO content has been uploaded at this point
      console.log('⛓️ Requesting signature for on-chain attestation...');
      await signAndPublishOnChain(contentHash, timestampMs, tempPostId);
      console.log('✅ On-chain attestation signed and published');

      // Signing complete, now switch to upload phase
      setIsSigning(false);
      setIsUploading(true);

      // Step 3: Only after signing succeeds, upload media (if any)
      let mediaUrls: string[] = [];
      let attachment: { type: 'image' | 'video'; url: string } | undefined;

      if (media.length > 0) {
        console.log('📤 Uploading', media.length, 'files to R2...');
        const uploadResult = await apiService.batchUploadMedia(
          media.map(m => m.file),
          activeAddress
        );

        if (!uploadResult.success || !uploadResult.data || uploadResult.data.length === 0) {
          throw new Error(uploadResult.error || 'Upload failed');
        }

        console.log('✅ Upload successful:', uploadResult.data);
        mediaUrls = uploadResult.data.map(f => f.public_url);
        attachment = {
          type: media[0].type,
          url: uploadResult.data[0].public_url,
        };
      }

      // Step 4: Only after upload succeeds, create post in database
      console.log('📝 Creating post in database...');
      const createResult = await apiService.createPost({
        author_id: user.id,
        wallet_address: activeAddress,
        content: trimmedContent,
        media_urls: mediaUrls.length > 0 ? mediaUrls : undefined,
      });

      if (!createResult.success || !createResult.data) {
        throw new Error(createResult.error || 'Failed to create post');
      }

      console.log('✅ Post created:', {
        postId: createResult.data.post.id,
        contentHash: createResult.data.content_hash,
      });

      // Success - notify parent and clear form
      onPost(trimmedContent, attachment);
      setContent('');
      media.forEach(item => URL.revokeObjectURL(item.preview));
      setMedia([]);
      if (imageInputRef.current) imageInputRef.current.value = '';
      if (videoInputRef.current) videoInputRef.current.value = '';

    } catch (error: any) {
      // Any failure at any step stops the flow
      console.error('❌ Post publish failed:', error);
      const errorMessage = error?.message || 'Failed to publish post';

      // Provide clearer error messages for common cases
      if (errorMessage.includes('rejected') || errorMessage.includes('denied') || errorMessage.includes('cancelled')) {
        setUploadError('Transaction cancelled. No content was sent.');
      } else {
        setUploadError(errorMessage);
      }
    } finally {
      setIsSigning(false);
      setIsUploading(false);
    }
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

  const canPost = (content.trim() || media.length > 0) && !isUploading && !isSigning;

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
            {isSigning ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-1.5"></div>
                Signing...
              </>
            ) : isUploading ? (
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
