import { type MediaReference, getWalrusUrl } from '../lib/api';

interface MediaGalleryProps {
  media: MediaReference[];
}

export function MediaGallery({ media }: MediaGalleryProps) {
  if (!media || media.length === 0) return null;

  // Single media item - full width display
  if (media.length === 1) {
    return <SingleMediaView media={media[0]} />;
  }

  // Multiple media items - grid layout
  return (
    <div className={`grid gap-2 ${media.length === 2 ? 'grid-cols-2' : 'grid-cols-2'}`}>
      {media.slice(0, 4).map((item) => (
        <MediaThumbnail key={item.blob_id} media={item} />
      ))}
    </div>
  );
}

function SingleMediaView({ media }: { media: MediaReference }) {
  const url = getWalrusUrl(media.blob_id);

  if (media.content_type.startsWith('image/')) {
    return (
      <img
        src={url}
        alt="Post media"
        className="rounded-lg max-w-full w-full object-contain max-h-[500px] bg-gray-100"
        loading="lazy"
      />
    );
  }

  if (media.content_type.startsWith('video/')) {
    return (
      <video
        src={url}
        controls
        className="rounded-lg max-w-full w-full max-h-[500px] bg-black"
        preload="metadata"
      />
    );
  }

  return null;
}

function MediaThumbnail({ media }: { media: MediaReference }) {
  const url = getWalrusUrl(media.blob_id);

  if (media.content_type.startsWith('image/')) {
    return (
      <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
        <img
          src={url}
          alt="Post media thumbnail"
          className="w-full h-full object-cover hover:opacity-90 transition-opacity cursor-pointer"
          loading="lazy"
        />
      </div>
    );
  }

  if (media.content_type.startsWith('video/')) {
    return (
      <div className="relative aspect-square rounded-lg overflow-hidden bg-black">
        <video
          src={url}
          className="w-full h-full object-cover"
          preload="metadata"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-40 pointer-events-none">
          <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z"/>
          </svg>
        </div>
      </div>
    );
  }

  return null;
}
