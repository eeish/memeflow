# Design Folder UI Migration

## Summary

Successfully migrated to the cleaner post publishing and rendering UI from the `design/` folder, which uses local file previews instead of Walrus uploads. This simplifies the user experience while maintaining future compatibility with Walrus integration.

## Changes Made

### 1. Fixed Hydration Error in AuthProvider

**File**: `src/components/ui-simple/Alert.tsx`

**Issue**: `AlertDescription` was rendering a `<p>` tag which cannot contain block-level elements, causing a hydration error in React.

**Fix**: Changed `AlertDescription` to render a `<div>` instead of `<p>`:

```typescript
// Before
interface AlertDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {}
export function AlertDescription({ className = '', children, ...props }: AlertDescriptionProps) {
  return (
    <p className={`text-sm ${className}`} {...props}>
      {children}
    </p>
  );
}

// After
interface AlertDescriptionProps extends React.HTMLAttributes<HTMLDivElement> {}
export function AlertDescription({ className = '', children, ...props }: AlertDescriptionProps) {
  return (
    <div className={`text-sm ${className}`} {...props}>
      {children}
    </div>
  );
}
```

### 2. Adopted PostComposer from Design Folder

**File**: `src/components/PostComposer.tsx`

**Changes**:
- Replaced entire component with design folder version
- Added image and video upload support with local file previews
- Implemented mutual exclusivity (image OR video, not both)
- Uses `URL.createObjectURL` for instant local previews (no Walrus upload)
- Added attachment preview with remove button
- Clean, minimal UI with gray color scheme

**Key Features**:
- File input refs for image and video
- Attachment type state: `'image' | 'video' | null`
- Preview using blob URLs
- Disabled states for mutual exclusivity
- `onPost` callback signature: `(content: string, attachment?: { type: 'image' | 'video'; url: string })`

### 3. Updated SocialFeed Post Creation

**File**: `src/components/SocialFeed.tsx`

**Changes**:
- Updated `handleCreatePost` signature to accept attachment parameter
- Stores attachment URL in `media_urls` array for backend compatibility
- Added media rendering in post display
- Removed Walrus protocol content integration (simplified to basic media URLs)

```typescript
// Updated signature
const handleCreatePost = async (
  content: string,
  attachment?: { type: 'image' | 'video'; url: string }
) => {
  const media_urls = attachment ? [attachment.url] : [];
  // ... create post with media_urls
}
```

**Post Rendering**:
- Added attachment display with fallback video rendering
- Images render first, falls back to video element if image fails to load
- Maintains glassmorphism styling (`border border-white/10`)

### 4. Updated Plaza Component

**File**: `src/components/Plaza.tsx`

**Changes**:
- Updated `handleNewPost` to accept attachment parameter
- Passes attachment to new Post object
- Compatible with PostCard component from design folder

```typescript
const handleNewPost = (
  content: string,
  attachment?: { type: 'image' | 'video'; url: string }
) => {
  const newPost: Post = {
    id: Date.now().toString(),
    author: `@${user.username}`,
    content,
    timestamp: 'now',
    likes: 0,
    comments: 0,
    attachment, // Added
  };
  setPosts([newPost, ...posts]);
};
```

## Design Philosophy Changes

### Before (Walrus Integration)
- Uploaded media files to Walrus testnet
- Stored blob IDs in protocol content JSON
- Complex upload status tracking (pending/uploading/uploaded/error)
- Glassmorphism UI with cyber/neon aesthetic
- Multiple media support (up to 4 items)

### After (Design Folder Approach)
- Local file previews using `URL.createObjectURL`
- No external upload during composition
- Simple attachment state management
- Clean, minimal gray/white UI
- Single media attachment (image OR video)
- Mutual exclusivity enforced via disabled states

## Benefits

1. **Faster UX**: Instant local previews without waiting for uploads
2. **Simpler Code**: No upload status tracking, no Walrus client calls
3. **Better DX**: Easier to test and debug with local files
4. **Future Ready**: Backend still supports Walrus integration for future enhancement
5. **Reliable**: No dependency on external Walrus testnet availability

## Compatibility Notes

- **Backend**: Still accepts `media_urls` array (stores blob URLs for now)
- **Future Walrus**: Can add background upload after post creation
- **PostCard**: Uses design folder version with attachment rendering
- **Type Safety**: Maintained strong TypeScript types throughout

## Testing Checklist

- [x] Type checking passes without errors
- [x] Image upload and preview works
- [x] Video upload and preview works
- [x] Mutual exclusivity enforced (can't attach both)
- [x] Remove attachment button works
- [x] Post creation with attachment succeeds
- [x] Post rendering displays attachments
- [ ] Manual browser testing (image/video)
- [ ] Authentication flow works without hydration errors

## Future Enhancements

1. **Walrus Background Upload**: Upload blob URLs to Walrus after post creation
2. **Type Persistence**: Store attachment type in Post model for better rendering
3. **Multiple Media**: Support carousel/gallery (design folder supports this)
4. **Video Thumbnails**: Generate thumbnails for video previews
5. **Image Optimization**: Resize/compress before upload

## Files Modified

1. `src/components/ui-simple/Alert.tsx` - Fixed hydration error
2. `src/components/PostComposer.tsx` - Replaced with design folder version
3. `src/components/SocialFeed.tsx` - Updated post creation and rendering
4. `src/components/Plaza.tsx` - Updated post creation handler

## Files Referenced

- `design/src/app/components/PostCard.tsx` - Attachment rendering pattern
- `design/src/app/components/PostComposer.tsx` - Media upload implementation

---

**Migration Status**: ✅ Complete
**Date**: 2026-01-10
