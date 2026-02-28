use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ============================================================================
// User Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: Uuid,
    pub wallet_address: Option<String>,
    pub email: Option<String>,
    pub username: String,
    pub avatar_url: Option<String>,
    pub bio: Option<String>,
    pub token_symbol: String,
    pub followers_count: i64,
    pub following_count: i64,
    pub posts_count: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateUserRequest {
    pub wallet_address: Option<String>,
    pub email: Option<String>,
    pub username: String,
    pub bio: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserProfile {
    pub id: Uuid,
    pub username: String,
    pub avatar_url: Option<String>,
    pub token_symbol: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wallet_address: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bio: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub followers_count: Option<i64>,
}

// ============================================================================
// Notification Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Notification {
    pub id: String,
    pub user_id: String,
    pub content: String,
    pub notification_type: String,
    pub status: String, // pending | sent | failed | read
    #[serde(skip_serializing_if = "Option::is_none")]
    pub related_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actor_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actor_username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actor_avatar_url: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateNotificationRequest {
    pub user_id: String,
    pub content: String,
}

// ============================================================================
// Post Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Post {
    pub id: Uuid,
    pub author_id: Uuid,
    pub content: String,
    pub media_urls: Vec<String>,
    pub content_blob_id: Option<String>,
    pub content_protocol_version: Option<String>,
    /// SHA256 hash for on-chain attestation
    /// Hash = SHA256(author[32] || timestamp_ms[8 BE] || content[*])
    pub content_hash: Option<String>,
    /// Timestamp used in hash computation (Unix ms)
    pub hash_timestamp_ms: Option<i64>,
    pub likes_count: i64,
    pub comments_count: i64,
    pub reposts_count: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostWithAuthor {
    #[serde(flatten)]
    pub post: Post,
    pub author: UserProfile,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePostRequest {
    pub author_id: String,
    pub wallet_address: String,
    pub content: String,
    pub media_urls: Option<Vec<String>>,
    pub protocol_content: Option<ProtocolContent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePostResponse {
    pub post: Post,
    pub content_hash: String,
    pub timestamp_ms: i64,
    pub content_hash_bytes: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifyPostHashRequest {
    pub post_id: String,
    pub content_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifyPostHashResponse {
    pub valid: bool,
    pub post_id: String,
    pub author: String,
    pub timestamp_ms: i64,
    pub content_preview: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LikeRequest {
    pub user_id: String,
}

// ============================================================================
// Comment Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Comment {
    pub id: Uuid,
    pub post_id: Uuid,
    pub user_id: Uuid,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_comment_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommentWithAuthor {
    #[serde(flatten)]
    pub comment: Comment,
    pub author: UserProfile,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateCommentRequest {
    pub user_id: String,
    pub content: String,
    pub parent_comment_id: Option<String>,
    pub reply_to_user_id: Option<String>,
}

// ============================================================================
// API Response
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
    pub message: Option<String>,
}

impl<T> ApiResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
            message: None,
        }
    }

    pub fn error(error: String) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(error),
            message: None,
        }
    }
}

// ============================================================================
// Media Upload Types (R2)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaUploadResponse {
    pub file_key: String,
    pub public_url: String,
    pub content_type: String,
    pub size_bytes: u64,
    pub checksum: String,
}

// ============================================================================
// Protocol Types
// ============================================================================

use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProtocolContent {
    pub version: String,
    #[serde(default = "default_protocol_name")]
    pub protocol: String,
    pub created_at: String,
    pub content: ContentSection,
    pub media: Vec<MediaReference>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<HashMap<String, String>>,
}

fn default_protocol_name() -> String {
    "cord-post".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentSection {
    pub text: String,
    #[serde(default)]
    pub mentions: Vec<String>,
    #[serde(default)]
    pub hashtags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaReference {
    pub blob_id: String,
    pub content_type: String,
    pub size_bytes: u64,
    pub checksum: String,
    pub order: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_seconds: Option<f32>,
}
