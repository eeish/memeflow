# R2 Configuration Location

## Configuration File

**Location**: `service/.env`

To set up R2 credentials:

1. Copy the example file:
   ```bash
   cd service
   cp .env.example .env
   ```

2. Edit `service/.env` with your credentials:
   ```bash
   nano .env
   ```

3. Fill in these required fields:
   ```env
   R2_ACCOUNT_ID=your_account_id_here
   R2_ACCESS_KEY_ID=your_access_key_id_here
   R2_SECRET_ACCESS_KEY=your_secret_access_key_here
   R2_BUCKET_NAME=memeflow-media
   R2_PUBLIC_DOMAIN=pub-xxxxxxxxxxxxx.r2.dev
   ```

4. Restart the service:
   ```bash
   # From project root
   ./dev.sh restart

   # Or manually
   cd service
   cargo run
   ```

## Getting R2 Credentials

See detailed setup guide: `service/R2_SETUP.md`

Quick steps:
1. Go to https://dash.cloudflare.com/ → R2
2. Create a bucket (e.g., `memeflow-media`)
3. Enable public access and get public domain
4. Create API token with "Object Read & Write" permissions
5. Copy Account ID from dashboard URL

## Verification

After restart, you should see in the logs:
```
✅ R2 client initialized successfully
✅ R2 bucket is accessible
```

## API Endpoints

Once configured, these endpoints will be available:

- `POST /api/media/upload` - Single file upload
- `POST /api/media/batch-upload` - Multiple files (up to 9)

## Frontend Integration

The frontend can now upload images using the batch upload endpoint. See the R2 client implementation in `src/lib/r2-upload.ts` (to be created).

## Cost

With Cloudflare R2's free tier (10 GB storage), this is suitable for initial testing and small-scale deployment. See `service/R2_SETUP.md` for detailed pricing information.
