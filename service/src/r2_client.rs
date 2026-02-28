use anyhow::{Context, Result};
use aws_config::Region;
use aws_credential_types::Credentials;
use aws_sdk_s3::config::{BehaviorVersion, Builder as S3ConfigBuilder};
use aws_sdk_s3::primitives::ByteStream;
use aws_sdk_s3::Client as S3Client;
use sha2::{Digest, Sha256};
use std::env;

/// Cloudflare R2 client for file uploads
#[derive(Clone)]
pub struct R2Client {
    client: S3Client,
    bucket_name: String,
    public_url_base: String,
}

impl R2Client {
    /// Create a new R2 client from environment variables
    pub async fn from_env() -> Result<Self> {
        // Load R2 configuration from environment
        let account_id =
            env::var("R2_ACCOUNT_ID").context("R2_ACCOUNT_ID not set in environment")?;
        let access_key_id =
            env::var("R2_ACCESS_KEY_ID").context("R2_ACCESS_KEY_ID not set in environment")?;
        let secret_access_key = env::var("R2_SECRET_ACCESS_KEY")
            .context("R2_SECRET_ACCESS_KEY not set in environment")?;
        let bucket_name =
            env::var("R2_BUCKET_NAME").context("R2_BUCKET_NAME not set in environment")?;
        let public_domain = env::var("R2_PUBLIC_DOMAIN")
            .context("R2_PUBLIC_DOMAIN not set in environment (e.g., pub-xxxxx.r2.dev)")?;

        // Construct R2 endpoint URL
        let endpoint_url = format!("https://{}.r2.cloudflarestorage.com", account_id);

        tracing::info!("Initializing R2 client with endpoint: {}", endpoint_url);
        tracing::info!("R2 bucket: {}", bucket_name);
        tracing::info!("R2 public domain: {}", public_domain);

        // Create AWS credentials
        let credentials = Credentials::new(
            access_key_id,
            secret_access_key,
            None,
            None,
            "r2-credentials",
        );

        // Build S3 config for R2
        let s3_config = S3ConfigBuilder::new()
            .region(Region::new("auto"))
            .endpoint_url(endpoint_url)
            .credentials_provider(credentials)
            .force_path_style(true)
            .behavior_version(BehaviorVersion::latest())
            .build();

        let client = S3Client::from_conf(s3_config);

        let public_url_base = format!("https://{}", public_domain);

        Ok(Self {
            client,
            bucket_name,
            public_url_base,
        })
    }

    /// Upload a file to R2 and return the public URL
    pub async fn upload_file(
        &self,
        file_data: Vec<u8>,
        content_type: &str,
        user_id: &str,
    ) -> Result<(String, String, String)> {
        // Generate unique file key
        let file_key = self.generate_file_key(&file_data, content_type, user_id);

        // Calculate checksum
        let checksum = self.calculate_checksum(&file_data);

        tracing::info!(
            "Uploading file to R2: key={}, size={} bytes, content_type={}",
            file_key,
            file_data.len(),
            content_type
        );

        // Upload to R2
        self.client
            .put_object()
            .bucket(&self.bucket_name)
            .key(&file_key)
            .body(ByteStream::from(file_data))
            .content_type(content_type)
            .send()
            .await
            .context("Failed to upload file to R2")?;

        // Construct public URL
        let public_url = format!("{}/{}", self.public_url_base, file_key);

        tracing::info!("File uploaded successfully: {}", public_url);

        Ok((file_key, public_url, checksum))
    }

    /// Generate a unique file key for R2 storage
    fn generate_file_key(&self, file_data: &[u8], content_type: &str, user_id: &str) -> String {
        // Hash file content for uniqueness
        let mut hasher = Sha256::new();
        hasher.update(file_data);
        let hash = format!("{:x}", hasher.finalize());

        // Get file extension from content type
        let extension = match content_type {
            "image/png" => "png",
            "image/jpeg" | "image/jpg" => "jpg",
            "image/webp" => "webp",
            "image/gif" => "gif",
            "video/mp4" => "mp4",
            "video/webm" => "webm",
            _ => "bin",
        };

        // Organize by user_id prefix for better organization
        // Format: media/{user_prefix}/{hash}.{ext}
        let user_prefix = if user_id.len() > 8 {
            &user_id[0..8]
        } else {
            user_id
        };

        format!("media/{}/{}.{}", user_prefix, &hash[0..32], extension)
    }

    /// Calculate SHA-256 checksum of file data
    fn calculate_checksum(&self, data: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(data);
        format!("sha256:{:x}", hasher.finalize())
    }

    /// Check if R2 is configured and accessible
    pub async fn health_check(&self) -> Result<()> {
        self.client
            .head_bucket()
            .bucket(&self.bucket_name)
            .send()
            .await
            .context("R2 bucket health check failed")?;

        Ok(())
    }
}

/// Validate if content type is allowed for upload
pub fn is_valid_content_type(content_type: &str) -> bool {
    const ALLOWED_TYPES: &[&str] = &[
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/webp",
        "image/gif",
        "video/mp4",
        "video/webm",
    ];

    ALLOWED_TYPES
        .iter()
        .any(|&allowed| content_type.starts_with(allowed))
}
