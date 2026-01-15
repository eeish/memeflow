# Cloudflare R2 Implementation Summary

## ✅ Implementation Complete

The Rust service now supports uploading user-submitted images to Cloudflare R2 storage.

## 📍 Configuration File Location

**Primary configuration file**: `service/.env`

### Setup Steps:

1. **Copy the example file**:
   ```bash
   cd service
   cp .env.example .env
   ```

2. **Edit with your credentials**:
   ```bash
   nano .env  # or use your preferred editor
   ```

3. **Fill in the required values**:
   ```env
   R2_ACCOUNT_ID=your_account_id_here
   R2_ACCESS_KEY_ID=your_access_key_id_here
   R2_SECRET_ACCESS_KEY=your_secret_access_key_here
   R2_BUCKET_NAME=memeflow-media
   R2_PUBLIC_DOMAIN=pub-xxxxxxxxxxxxx.r2.dev
   ```

4. **Restart the service**:
   ```bash
   # From project root
   ./dev.sh restart

   # Or manually
   cd service && cargo run
   ```

## 📚 Documentation

Detailed setup guides are available:

- **`service/R2_SETUP.md`** - Complete step-by-step R2 setup guide
- **`R2_CONFIG_LOCATION.md`** - Quick reference for configuration
- **`service/.env.example`** - Template with all required variables

## 🔧 What Was Implemented

### Backend (Rust)

1. **New R2 Client Module** (`service/src/r2_client.rs`):
   - S3-compatible client for Cloudflare R2
   - Automatic file key generation with content hashing
   - SHA-256 checksum calculation
   - Health check functionality
   - Organized storage: `media/{user_prefix}/{hash}.{ext}`

2. **Upload Endpoints** (added to `service/src/handlers_simple.rs`):
   - `POST /api/media/upload` - Single file upload
   - `POST /api/media/batch-upload` - Batch upload (up to 9 files)

3. **Configuration**:
   - Environment-based configuration via `.env` file
   - Graceful degradation (service runs without R2, uploads disabled)
   - Automatic health check on startup

4. **Validation**:
   - Content type validation (images: PNG, JPEG, WebP, GIF; videos: MP4, WebM)
   - File size limits (10 MB images, 50 MB videos)
   - Batch size limits (9 files max, 100 MB total)

### Frontend (React + TypeScript)

1. **API Client** (`src/lib/api.ts`):
   - `uploadMedia()` - Single file upload method
   - `batchUploadMedia()` - Batch upload method
   - Type definitions for R2 responses

2. **PostComposer Integration** (`src/components/PostComposer.tsx`):
   - Automatic R2 upload before posting
   - Upload progress indicator
   - Error handling with user-friendly messages
   - Multi-file support with smart thumbnails

## 🚀 How It Works

1. **User selects images/videos** in PostComposer
2. **User clicks "Post"**
3. **Frontend uploads files** to backend via `/api/media/batch-upload`
4. **Backend uploads to R2** using S3-compatible API
5. **R2 returns public URLs** (e.g., `https://pub-xxx.r2.dev/media/...`)
6. **Post is created** with media URLs attached

## ✨ Features

- **Batch uploads**: Upload up to 9 files in a single request
- **Content-based deduplication**: Same file = same storage key
- **Organized storage**: Files organized by user ID prefix
- **Public CDN URLs**: Direct access via R2 public domain
- **Smart thumbnails**: UI adapts based on number of files
- **Error handling**: Clear error messages for users
- **Cost-effective**: Free tier covers 10 GB storage

## 🔐 Security

- API tokens scoped to specific bucket
- No credentials in frontend code
- Backend-controlled uploads (prevents abuse)
- Content type validation
- File size restrictions

## 🧪 Testing

### Test Single Upload (curl):

```bash
curl -X POST http://localhost:3001/api/media/upload \
  -F "file=@/path/to/image.jpg" \
  -F "user_id=test-user"
```

### Expected Response:

```json
{
  "success": true,
  "data": {
    "file_key": "media/test-use/abc123...xyz.jpg",
    "public_url": "https://pub-xxxxxxxxxxxxx.r2.dev/media/test-use/abc123...xyz.jpg",
    "content_type": "image/jpeg",
    "size_bytes": 123456,
    "checksum": "sha256:..."
  }
}
```

### Test in UI:

1. Connect wallet
2. Click image/video button in post composer
3. Select files (up to 9)
4. Click "Post"
5. Watch upload progress
6. Check console for upload results

## 📊 Service Logs

After restart with R2 configured, you should see:

```
✅ R2 client initialized successfully
✅ R2 bucket is accessible
🚀 MemeFlow Service running on http://0.0.0.0:3001
```

If R2 is not configured:

```
⚠️  R2 client not initialized: R2_ACCOUNT_ID not set in environment
⚠️  Media uploads will be disabled. Set R2 environment variables to enable uploads.
```

## 💰 Cost Estimate

**Cloudflare R2 Free Tier**:
- 10 GB storage/month
- 1M Class A operations (writes)
- 10M Class B operations (reads)

**Example usage**:
- 1000 users × 10 images = 10,000 uploads
- Average 2 MB/image = 20 GB storage
- **Monthly cost**: ~$0.35

See `service/R2_SETUP.md` for detailed pricing.

## 🆘 Troubleshooting

### Service won't start:
```bash
cd service
cargo build  # Check for compilation errors
```

### R2 not working:
1. Verify `.env` file exists in `service/` directory
2. Check all R2_* variables are set
3. Ensure bucket has public access enabled
4. Verify API token permissions

### Uploads failing:
- Check service logs for detailed errors
- Verify file size < 10 MB (images) or < 50 MB (videos)
- Ensure content type is supported
- Check R2 bucket isn't full

## 📝 Next Steps

After configuration:
1. ✅ Service will automatically use R2 for uploads
2. 🔄 Posts can include uploaded media URLs
3. 🖼️ Media gallery components can display R2-hosted images
4. 📊 Analytics can track storage usage

## 🎉 Summary

Everything is ready! Just add your R2 credentials to `service/.env` and restart the service. The media upload system will automatically activate and users can start uploading images and videos to your Cloudflare R2 bucket.
