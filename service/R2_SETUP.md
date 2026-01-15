# Cloudflare R2 Setup Guide

This guide will help you configure Cloudflare R2 storage for media uploads in MemeFlow.

## Prerequisites

- A Cloudflare account (free tier is sufficient)
- R2 enabled on your account (may require credit card verification)

## Step-by-Step Setup

### 1. Create an R2 Bucket

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **R2** in the left sidebar
3. Click **Create bucket**
4. Choose a bucket name (e.g., `memeflow-media`)
5. Click **Create bucket**

### 2. Enable Public Access (Required)

1. Click on your newly created bucket
2. Go to **Settings** tab
3. Scroll to **Public access** section
4. Click **Allow Access** and **Connect Domain**
5. Choose **R2.dev subdomain** (free option)
6. Note the public domain (e.g., `pub-xxxxxxxxxxxxx.r2.dev`)

**Important**: Without public access enabled, uploaded images won't be accessible via URLs.

### 3. Create API Token

1. In R2 dashboard, click **Manage R2 API Tokens**
2. Click **Create API token**
3. Configure the token:
   - **Name**: `memeflow-uploads`
   - **Permissions**: Select **Object Read & Write**
   - **Bucket scope**: Select your bucket (`memeflow-media`)
4. Click **Create API Token**
5. **IMPORTANT**: Copy the credentials immediately (you won't see them again):
   - Access Key ID
   - Secret Access Key

### 4. Get Your Account ID

1. In the R2 dashboard, look at the URL bar
2. The URL will be: `https://dash.cloudflare.com/{account_id}/r2/...`
3. Copy the `{account_id}` portion

Or find it in:
- **R2** → **Overview** → **Account ID** (shown on the page)

### 5. Configure the Service

1. Navigate to the service directory:
   ```bash
   cd service
   ```

2. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

3. Edit `.env` with your credentials:
   ```bash
   nano .env  # or use your preferred editor
   ```

4. Fill in the values:
   ```env
   R2_ACCOUNT_ID=your_account_id_here
   R2_ACCESS_KEY_ID=your_access_key_id_here
   R2_SECRET_ACCESS_KEY=your_secret_access_key_here
   R2_BUCKET_NAME=memeflow-media
   R2_PUBLIC_DOMAIN=pub-xxxxxxxxxxxxx.r2.dev
   ```

### 6. Restart the Service

```bash
# If using the dev script
cd ..
./dev.sh restart

# Or manually
cd service
cargo run
```

## Verification

After restart, check the logs for:

```
✅ R2 client initialized successfully
✅ R2 bucket is accessible
```

If you see errors, verify:
- All credentials are correct
- The bucket exists
- Public access is enabled
- API token has correct permissions

## Testing Upload

You can test the upload endpoint with curl:

```bash
curl -X POST http://localhost:3001/api/media/upload \
  -F "file=@/path/to/image.jpg" \
  -F "user_id=test-user"
```

Expected response:
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

## Cost Information

**Cloudflare R2 Pricing** (as of 2024):
- **Storage**: $0.015 per GB/month
- **Class A Operations** (writes): $4.50 per million requests
- **Class B Operations** (reads): $0.36 per million requests
- **Egress**: Free (no bandwidth charges)

**Free Tier**:
- 10 GB storage per month
- 1 million Class A operations per month
- 10 million Class B operations per month

For a typical social app:
- 1000 users uploading 10 images each = 10,000 uploads (Class A)
- Average image size 2MB = 20 GB storage
- Monthly cost: ~$0.30 + $0.045 = **~$0.35/month**

## Security Best Practices

1. **Never commit `.env` file** - it's already in `.gitignore`
2. **Rotate API tokens** periodically
3. **Use bucket-scoped tokens** - don't use account-wide tokens
4. **Enable CORS** on your bucket if uploading from frontend
5. **Consider rate limiting** to prevent abuse

## Troubleshooting

### "R2 client not configured"
- Check that `.env` file exists in `service/` directory
- Verify all R2_* variables are set
- Restart the service after adding credentials

### "R2 bucket health check failed"
- Verify bucket name is correct
- Check that API token has read permissions
- Ensure bucket exists in the correct Cloudflare account

### "Failed to upload to R2"
- Check API token has write permissions
- Verify bucket isn't full (free tier: 10 GB limit)
- Check Cloudflare R2 service status

### Images not accessible after upload
- Verify public access is enabled on the bucket
- Check that R2_PUBLIC_DOMAIN is correctly set
- Ensure the domain is connected in R2 settings

## Alternative: Custom Domain

Instead of `r2.dev` subdomain, you can use your own domain:

1. Go to R2 bucket settings
2. Click **Connect Domain** → **Custom domain**
3. Enter your domain (e.g., `cdn.yourdomain.com`)
4. Add the required DNS records to your domain
5. Update `.env`:
   ```env
   R2_PUBLIC_DOMAIN=cdn.yourdomain.com
   ```

## Need Help?

- [Cloudflare R2 Docs](https://developers.cloudflare.com/r2/)
- [R2 Pricing](https://developers.cloudflare.com/r2/pricing/)
- [API Documentation](https://developers.cloudflare.com/r2/api/s3/)
