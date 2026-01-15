use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: Uuid,
    pub wallet_address: Option<String>,
    pub email: Option<String>,
    pub username: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub bio: Option<String>,
    pub token_symbol: String, // Derived from username/address
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
    pub display_name: Option<String>,
    pub bio: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateUserFromWalletRequest {
    pub wallet_address: String,
    pub username: Option<String>, // If not provided, will be generated
    pub display_name: Option<String>,
    pub bio: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserExistsResponse {
    pub exists: bool,
    pub user: Option<UserProfile>,
    pub is_new_address: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateProfileRequest {
    pub display_name: Option<String>,
    pub bio: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Post {
    pub id: Uuid,
    pub author_id: Uuid,
    pub content: String,
    pub media_urls: Vec<String>,
    pub content_blob_id: Option<String>,         // Walrus blob ID for protocol content
    pub content_protocol_version: Option<String>, // Protocol version (e.g., "1.0")
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
pub struct UserProfile {
    pub id: Uuid,
    pub username: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub token_symbol: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePostRequest {
    pub author_id: String,
    pub content: String,
    pub media_urls: Option<Vec<String>>,
    pub protocol_content: Option<ProtocolContent>, // Walrus protocol content
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LikeRequest {
    pub user_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenMetadata {
    pub symbol: String,
    pub name: String,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub website_url: Option<String>,
    pub twitter_url: Option<String>,
    pub discord_url: Option<String>,
    pub total_supply: Option<String>,
    pub creator_id: Uuid,
    pub market_cap_usd: Option<f64>,
    pub price_usd: Option<f64>,
    pub volume_24h_usd: Option<f64>,
    pub holders_count: i64,
    pub is_verified: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateTokenMetadataRequest {
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub website_url: Option<String>,
    pub twitter_url: Option<String>,
    pub discord_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Comment {
    pub id: Uuid,
    pub post_id: Uuid,
    pub author_id: Uuid,
    pub content: String,
    pub likes_count: i64,
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
    pub author_id: Uuid,
    pub content: String,
}


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FollowRequest {
    pub follower_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FollowStatusResponse {
    pub is_following: bool,
    pub followers_count: i64,
    pub following_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Notification {
    pub id: Uuid,
    pub user_id: Uuid,
    pub title: String,
    pub content: String,
    pub notification_type: NotificationType,
    pub related_id: Option<Uuid>, // Could be post_id, user_id, etc.
    pub is_read: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum NotificationType {
    #[serde(rename = "like")]
    Like,
    #[serde(rename = "comment")]
    Comment,
    #[serde(rename = "follow")]
    Follow,
    #[serde(rename = "mention")]
    Mention,
    #[serde(rename = "token_update")]
    TokenUpdate,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchQuery {
    pub q: String,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Analytics {
    pub total_users: i64,
    pub total_posts: i64,
    pub total_tokens: i64,
    pub active_users_24h: i64,
    pub posts_24h: i64,
    pub top_tokens: Vec<TokenMetadata>,
    pub top_users: Vec<UserProfile>,
}

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

    pub fn success_with_message(data: T, message: String) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
            message: Some(message),
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

/// User Content Protocol - canonical representation of post content
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
    "memeflow-post".to_string()
}

/// Content section containing text and extracted entities
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentSection {
    pub text: String,
    #[serde(default)]
    pub mentions: Vec<String>,
    #[serde(default)]
    pub hashtags: Vec<String>,
}

/// Media reference to a Walrus blob
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