use crate::{models::*, username_validation, profile_validation, AppState};
use axum::{
    extract::{Multipart, Path, Query, State},
    http::StatusCode,
    response::Json,
};
use serde::{Deserialize, Serialize};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use sha2::{Digest, Sha256};
#[derive(Deserialize)]
pub struct PlazaQuery {
    pub limit: Option<i32>,
    pub offset: Option<i32>,
}

// Health check endpoint
pub async fn health_check() -> Json<ApiResponse<String>> {
    Json(ApiResponse::success("Cord Service is running! 🚀".to_string()))
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ZkLoginSaltRequest {
    pub token: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZkLoginProofRequest {
    pub jwt: String,
    #[serde(alias = "extended_ephemeral_public_key")]
    pub extended_ephemeral_public_key: String,
    #[serde(alias = "max_epoch")]
    pub max_epoch: u64,
    #[serde(alias = "jwt_randomness")]
    pub jwt_randomness: String,
    pub salt: String,
    #[serde(alias = "key_claim_name")]
    pub key_claim_name: String,
}

#[derive(Debug, Deserialize)]
struct ZkLoginJwtClaims {
    sub: String,
    iss: Option<String>,
    aud: Option<String>,
}

fn decode_jwt_claims(token: &str) -> Result<ZkLoginJwtClaims, String> {
    let mut parts = token.split('.');
    let _header = parts.next().ok_or("JWT missing header segment")?;
    let payload = parts.next().ok_or("JWT missing payload segment")?;
    let _signature = parts.next().ok_or("JWT missing signature segment")?;

    let payload_bytes = URL_SAFE_NO_PAD
        .decode(payload)
        .map_err(|e| format!("Failed to base64 decode JWT payload: {e}"))?;

    serde_json::from_slice::<ZkLoginJwtClaims>(&payload_bytes)
        .map_err(|e| format!("Failed to parse JWT payload JSON: {e}"))
}

fn derive_local_salt(token: &str) -> Result<String, String> {
    let secret = std::env::var("ZKLOGIN_SALT_SECRET")
        .map_err(|_| "ZKLOGIN_SALT_SECRET is not set".to_string())?;

    let claims = decode_jwt_claims(token)?;

    if claims.sub.is_empty() {
        return Err("JWT missing sub claim".to_string());
    }

    if let Ok(expected_aud) = std::env::var("ZKLOGIN_ALLOWED_AUD") {
        if let Some(aud) = &claims.aud {
            if aud != &expected_aud {
                return Err("JWT aud claim does not match ZKLOGIN_ALLOWED_AUD".to_string());
            }
        } else {
            return Err("JWT missing aud claim".to_string());
        }
    }

    let mut hasher = Sha256::new();
    hasher.update(secret.as_bytes());
    hasher.update(b":");
    hasher.update(claims.sub.as_bytes());
    if let Some(iss) = claims.iss {
        hasher.update(b":");
        hasher.update(iss.as_bytes());
    }
    if let Some(aud) = claims.aud {
        hasher.update(b":");
        hasher.update(aud.as_bytes());
    }

    let digest = hasher.finalize();
    let salt_bytes = &digest[..16];
    Ok(format!("0x{}", hex::encode(salt_bytes)))
}

// Proxy zkLogin salt request to Mysten service to avoid CORS in browser
pub async fn zklogin_salt_proxy(
    Json(request): Json<ZkLoginSaltRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let mode = std::env::var("ZKLOGIN_SALT_MODE").unwrap_or_else(|_| "proxy".to_string());
    if mode == "local" {
        match derive_local_salt(&request.token) {
            Ok(salt) => {
                return Ok(Json(serde_json::json!({ "salt": salt })));
            }
            Err(message) => {
                return Err((
                    StatusCode::BAD_REQUEST,
                    Json(serde_json::json!({ "error": message })),
                ));
            }
        }
    }

    let url = std::env::var("ZKLOGIN_SALT_URL")
        .unwrap_or_else(|_| "https://salt.api.mystenlabs.com/get_salt".to_string());

    let client = reqwest::Client::new();
    let response = client
        .post(url)
        .json(&request)
        .send()
        .await
        .map_err(|e| {
            tracing::error!("zkLogin salt proxy request failed: {}", e);
            (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({ "error": "Upstream request failed" })),
            )
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_else(|_| "<unreadable body>".to_string());
        tracing::error!(
            "zkLogin salt proxy upstream error: status={} body={}",
            status,
            body
        );
        return Err((
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({
                "error": "Upstream error",
                "upstream_status": status.as_u16(),
                "upstream_body": body,
            })),
        ));
    }

    let body = response
        .json::<serde_json::Value>()
        .await
        .map_err(|e| {
            tracing::error!("zkLogin salt proxy response decode failed: {}", e);
            (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({ "error": "Upstream response decode failed" })),
            )
        })?;

    Ok(Json(body))
}

// Proxy zkLogin proof request to Mysten prover to avoid CORS in browser
pub async fn zklogin_proof_proxy(
    Json(request): Json<ZkLoginProofRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let url = std::env::var("ZKLOGIN_PROVER_URL")
        .unwrap_or_else(|_| "https://prover-dev.mystenlabs.com/v1".to_string());

    let client = reqwest::Client::new();
    let response = client
        .post(url)
        .json(&request)
        .send()
        .await
        .map_err(|e| {
            tracing::error!("zkLogin prover proxy request failed: {}", e);
            (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({ "error": "Upstream request failed" })),
            )
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_else(|_| "<unreadable body>".to_string());
        tracing::error!(
            "zkLogin prover proxy upstream error: status={} body={}",
            status,
            body
        );
        return Err((
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({
                "error": "Upstream error",
                "upstream_status": status.as_u16(),
                "upstream_body": body,
            })),
        ));
    }

    let body = response
        .json::<serde_json::Value>()
        .await
        .map_err(|e| {
            tracing::error!("zkLogin prover proxy response decode failed: {}", e);
            (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({ "error": "Upstream response decode failed" })),
            )
        })?;

    Ok(Json(body))
}

// Plaza - Global feed endpoint (Twitter-like public timeline)
pub async fn get_plaza_posts(
    State(app_state): State<AppState>,
    Query(params): Query<PlazaQuery>,
) -> Json<ApiResponse<Vec<PostWithAuthor>>> {
    tracing::info!("Getting plaza posts with limit={:?}, offset={:?}", 
        params.limit, params.offset);
    
    match app_state.db.get_plaza_posts(params.limit, params.offset).await {
        Ok(posts) => {
            tracing::info!("Retrieved {} posts for plaza", posts.len());
            Json(ApiResponse::success(posts))
        }
        Err(e) => {
            tracing::error!("Failed to get plaza posts: {}", e);
            Json(ApiResponse::error("Failed to retrieve plaza posts".to_string()))
        }
    }
}

// User verification endpoints (required for authentication)
pub async fn check_user_exists_by_address(
    State(app_state): State<AppState>,
    Path(address): Path<String>,
) -> Json<ApiResponse<bool>> {
    tracing::info!("Checking if user exists with address: {}", address);
    
    match app_state.db.user_exists_by_address(&address).await {
        Ok(exists) => {
            Json(ApiResponse::success(exists))
        }
        Err(e) => {
            tracing::error!("Failed to check user existence: {}", e);
            Json(ApiResponse::error("Failed to check user existence".to_string()))
        }
    }
}

pub async fn get_user_by_address(
    State(app_state): State<AppState>,
    Path(address): Path<String>,
) -> Json<ApiResponse<User>> {
    tracing::info!("Getting user by address: {}", address);

    match app_state.db.get_user_by_address(&address).await {
        Ok(Some(user)) => {
            Json(ApiResponse::success(user))
        }
        Ok(None) => {
            Json(ApiResponse::error("User not found".to_string()))
        }
        Err(e) => {
            tracing::error!("Failed to get user by address: {}", e);
            Json(ApiResponse::error("Failed to retrieve user".to_string()))
        }
    }
}

pub async fn get_user_by_id(
    State(app_state): State<AppState>,
    Path(user_id): Path<String>,
) -> Json<ApiResponse<User>> {
    tracing::info!("Getting user by id: {}", user_id);

    match app_state.db.get_user_by_id(&user_id).await {
        Ok(Some(user)) => {
            Json(ApiResponse::success(user))
        }
        Ok(None) => {
            Json(ApiResponse::error("User not found".to_string()))
        }
        Err(e) => {
            tracing::error!("Failed to get user by id: {}", e);
            Json(ApiResponse::error("Failed to retrieve user".to_string()))
        }
    }
}

/// Response for username availability check
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsernameCheckResponse {
    pub available: bool,
    pub normalized: String,
    pub error: Option<String>,
}

/// Check if a username is available and valid
pub async fn check_username_available(
    State(app_state): State<AppState>,
    Path(username): Path<String>,
) -> Json<ApiResponse<UsernameCheckResponse>> {
    tracing::info!("Checking username availability: {}", username);

    // Validate username format
    let normalized = match username_validation::validate_username(&username) {
        Ok(name) => name,
        Err(e) => {
            tracing::info!("Username validation failed: {}", e);
            return Json(ApiResponse::success(UsernameCheckResponse {
                available: false,
                normalized: username.trim().to_lowercase(),
                error: Some(e.to_string()),
            }));
        }
    };

    // Check if username is already taken
    match app_state.db.username_exists(&normalized).await {
        Ok(exists) => {
            let response = UsernameCheckResponse {
                available: !exists,
                normalized,
                error: if exists {
                    Some("This username is already taken".to_string())
                } else {
                    None
                },
            };
            Json(ApiResponse::success(response))
        }
        Err(e) => {
            tracing::error!("Failed to check username: {}", e);
            Json(ApiResponse::error("Failed to check username availability".to_string()))
        }
    }
}

pub async fn create_user(
    State(app_state): State<AppState>,
    Json(mut request): Json<CreateUserRequest>,
) -> Json<ApiResponse<User>> {
    tracing::info!("Creating new user: wallet_address={:?}, username={}",
        request.wallet_address, request.username);

    // Validate and normalize username
    let normalized_username = match username_validation::validate_username(&request.username) {
        Ok(name) => name,
        Err(e) => {
            tracing::warn!("Username validation failed: {}", e);
            return Json(ApiResponse::error(e.to_string()));
        }
    };

    // Check if username is already taken
    match app_state.db.username_exists(&normalized_username).await {
        Ok(true) => {
            tracing::warn!("Username already taken: {}", normalized_username);
            return Json(ApiResponse::error("This username is already taken".to_string()));
        }
        Ok(false) => {}
        Err(e) => {
            tracing::error!("Failed to check username: {}", e);
            return Json(ApiResponse::error("Failed to validate username".to_string()));
        }
    }

    // Update request with normalized username
    request.username = normalized_username;

    match app_state.db.create_user(request).await {
        Ok(user) => {
            tracing::info!("User created successfully: {}", user.id);
            Json(ApiResponse::success(user))
        }
        Err(e) => {
            tracing::error!("Failed to create user: {}", e);
            Json(ApiResponse::error("Failed to create user".to_string()))
        }
    }
}

/// Request body for updating user profile
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateUserProfileRequest {
    pub username: Option<String>,
    pub bio: Option<String>,
    pub avatar_url: Option<String>,
}

/// Update user profile (username, bio, avatar)
pub async fn update_user_profile(
    State(app_state): State<AppState>,
    Path(user_id): Path<String>,
    Json(request): Json<UpdateUserProfileRequest>,
) -> Json<ApiResponse<User>> {
    tracing::info!("Updating profile for user: {}", user_id);

    // Validate username if provided
    let validated_username = if let Some(ref username) = request.username {
        match profile_validation::validate_username_for_update(username) {
            Ok(normalized) => {
                // Check if username is available (excluding current user)
                match app_state.db.username_exists_excluding_user(&normalized, &user_id).await {
                    Ok(true) => {
                        tracing::warn!("Username already taken: {}", normalized);
                        return Json(ApiResponse::error("This username is already taken".to_string()));
                    }
                    Ok(false) => Some(normalized),
                    Err(e) => {
                        tracing::error!("Failed to check username availability: {}", e);
                        return Json(ApiResponse::error("Failed to validate username".to_string()));
                    }
                }
            }
            Err(e) => {
                tracing::warn!("Username validation failed: {}", e);
                return Json(ApiResponse::error(e.to_string()));
            }
        }
    } else {
        None
    };

    // Validate bio if provided
    let validated_bio = if let Some(ref bio) = request.bio {
        match profile_validation::validate_bio(bio) {
            Ok(normalized) => Some(normalized),
            Err(e) => {
                tracing::warn!("Bio validation failed: {}", e);
                return Json(ApiResponse::error(e.to_string()));
            }
        }
    } else {
        None
    };

    // Validate avatar_url if provided
    let validated_avatar = if let Some(ref avatar_url) = request.avatar_url {
        match profile_validation::validate_avatar_url(avatar_url) {
            Ok(url) => url,
            Err(e) => {
                tracing::warn!("Avatar URL validation failed: {}", e);
                return Json(ApiResponse::error(e.to_string()));
            }
        }
    } else {
        None
    };

    // Update in database
    match app_state.db.update_user_profile(
        &user_id,
        validated_username,
        validated_bio,
        validated_avatar,
    ).await {
        Ok(user) => {
            tracing::info!("Profile updated successfully for user: {}", user_id);
            Json(ApiResponse::success(user))
        }
        Err(e) => {
            tracing::error!("Failed to update profile: {}", e);
            Json(ApiResponse::error("Failed to update profile".to_string()))
        }
    }
}

// News feed endpoint (for now, returns same as Plaza but can be personalized later)
pub async fn get_news_feed(
    State(app_state): State<AppState>,
    Path(user_id): Path<String>,
    Query(params): Query<PlazaQuery>,
) -> Json<ApiResponse<Vec<PostWithAuthor>>> {
    tracing::info!("Getting news feed for user: {} with limit={:?}, offset={:?}",
        user_id, params.limit, params.offset);

    // For now, return the same as Plaza (all posts)
    // In the future, this could be personalized based on who the user follows
    match app_state.db.get_plaza_posts(params.limit, params.offset).await {
        Ok(posts) => {
            tracing::info!("Retrieved {} posts for user feed", posts.len());
            Json(ApiResponse::success(posts))
        }
        Err(e) => {
            tracing::error!("Failed to get user feed: {}", e);
            Json(ApiResponse::error("Failed to retrieve news feed".to_string()))
        }
    }
}

// Get posts by a specific user
pub async fn get_user_posts(
    State(app_state): State<AppState>,
    Path(user_id): Path<String>,
    Query(params): Query<PlazaQuery>,
) -> Json<ApiResponse<Vec<PostWithAuthor>>> {
    tracing::info!("Getting posts for user {} with limit={:?}, offset={:?}",
        user_id, params.limit, params.offset);

    match app_state.db.get_user_posts(&user_id, params.limit, params.offset).await {
        Ok(posts) => {
            tracing::info!("Retrieved {} posts for user {}", posts.len(), user_id);
            Json(ApiResponse::success(posts))
        }
        Err(e) => {
            tracing::error!("Failed to get user posts: {}", e);
            Json(ApiResponse::error("Failed to retrieve user posts".to_string()))
        }
    }
}

// Create post endpoint
// Returns post with content_hash for on-chain attestation
pub async fn create_post(
    State(app_state): State<AppState>,
    Json(request): Json<CreatePostRequest>,
) -> Json<ApiResponse<CreatePostResponse>> {
    tracing::info!("Creating new post: author_id={}, wallet={}, content_length={}",
        request.author_id, request.wallet_address, request.content.len());

    // Generate timestamp for hash computation (Unix milliseconds)
    let timestamp_ms = chrono::Utc::now().timestamp_millis();

    // Compute content hash: SHA256(author[32] || timestamp_ms[8 BE] || content[*])
    let content_hash = match crate::post_hash::compute_content_hash(
        &request.wallet_address,
        timestamp_ms as u64,
        &request.content,
    ) {
        Ok(hash) => hash,
        Err(e) => {
            tracing::error!("Failed to compute content hash: {}", e);
            return Json(ApiResponse::error(format!("Invalid wallet address: {}", e)));
        }
    };

    // Get hash as bytes for Move contract
    let content_hash_bytes = match hex::decode(&content_hash) {
        Ok(bytes) => bytes,
        Err(e) => {
            tracing::error!("Failed to decode hash bytes: {}", e);
            return Json(ApiResponse::error(format!("Hash encoding error: {}", e)));
        }
    };

    tracing::info!("Computed content hash: {} (timestamp_ms={})", content_hash, timestamp_ms);

    // Create post in database with hash
    match app_state.db.create_post(request, Some(content_hash.clone()), Some(timestamp_ms)).await {
        Ok(post) => {
            tracing::info!("Post created successfully: id={}, hash={}",
                post.id, content_hash);

            let response = CreatePostResponse {
                post,
                content_hash,
                timestamp_ms,
                content_hash_bytes,
            };

            Json(ApiResponse::success(response))
        }
        Err(e) => {
            tracing::error!("Failed to create post: {}", e);
            Json(ApiResponse::error("Failed to create post".to_string()))
        }
    }
}

// Like post endpoint
pub async fn like_post(
    State(app_state): State<AppState>,
    Path(post_id): Path<String>,
    Json(request): Json<LikeRequest>,
) -> Json<ApiResponse<bool>> {
    tracing::info!("Toggling like for post: {} by user: {}", post_id, request.user_id);

    match app_state.db.like_post(&post_id, &request.user_id).await {
        Ok(is_liked) => {
            tracing::info!("Like toggled successfully: post={}, is_liked={}", post_id, is_liked);
            Json(ApiResponse::success(is_liked))
        }
        Err(e) => {
            tracing::error!("Failed to toggle like: {}", e);
            Json(ApiResponse::error("Failed to like post".to_string()))
        }
    }
}

// Verify post hash endpoint
// Verifies that a given hash matches the stored post content
pub async fn verify_post_hash(
    State(app_state): State<AppState>,
    Json(request): Json<VerifyPostHashRequest>,
) -> Json<ApiResponse<VerifyPostHashResponse>> {
    tracing::info!("Verifying post hash: post_id={}, hash={}", request.post_id, request.content_hash);

    // Get the post with author info
    let post_with_author = match app_state.db.get_post_with_author(&request.post_id).await {
        Ok(Some(p)) => p,
        Ok(None) => {
            tracing::warn!("Post not found: {}", request.post_id);
            return Json(ApiResponse::error("Post not found".to_string()));
        }
        Err(e) => {
            tracing::error!("Failed to get post: {}", e);
            return Json(ApiResponse::error("Failed to retrieve post".to_string()));
        }
    };

    // Get author's wallet address
    let wallet_address = match app_state.db.get_post_author_wallet(&request.post_id).await {
        Ok(Some(addr)) => addr,
        Ok(None) => {
            tracing::warn!("Author wallet address not found for post: {}", request.post_id);
            return Json(ApiResponse::error("Author wallet address not found".to_string()));
        }
        Err(e) => {
            tracing::error!("Failed to get author wallet: {}", e);
            return Json(ApiResponse::error("Failed to retrieve author wallet".to_string()));
        }
    };

    // Check if post has stored hash info
    let (stored_hash, timestamp_ms) = match (&post_with_author.post.content_hash, post_with_author.post.hash_timestamp_ms) {
        (Some(h), Some(t)) => (h.clone(), t),
        _ => {
            tracing::warn!("Post has no hash info: {}", request.post_id);
            return Json(ApiResponse::error("Post has no hash info (created before hash feature)".to_string()));
        }
    };

    // Verify the hash matches
    let valid = match crate::post_hash::verify_content_hash(
        &request.content_hash,
        &wallet_address,
        timestamp_ms as u64,
        &post_with_author.post.content,
    ) {
        Ok(v) => v,
        Err(e) => {
            tracing::error!("Hash verification error: {}", e);
            return Json(ApiResponse::error(format!("Hash verification error: {}", e)));
        }
    };

    // Also check against stored hash for consistency
    let matches_stored = request.content_hash == stored_hash;

    if valid != matches_stored {
        tracing::warn!("Hash verification inconsistency: computed={}, matches_stored={}", valid, matches_stored);
    }

    let content_preview = if post_with_author.post.content.len() > 100 {
        format!("{}...", &post_with_author.post.content[..100])
    } else {
        post_with_author.post.content.clone()
    };

    let response = VerifyPostHashResponse {
        valid,
        post_id: request.post_id,
        author: wallet_address,
        timestamp_ms,
        content_preview,
    };

    tracing::info!("Hash verification result: valid={}", valid);
    Json(ApiResponse::success(response))
}

// Follow/Unfollow endpoints
#[derive(Deserialize)]
pub struct FollowRequest {
    pub follower_id: uuid::Uuid,
}

#[derive(Serialize)]
pub struct FollowStatusResponse {
    pub is_following: bool,
    pub followers_count: i64,
    pub following_count: i64,
}

pub async fn follow_user(
    State(app_state): State<AppState>,
    Path(user_id): Path<uuid::Uuid>,
    Json(request): Json<FollowRequest>,
) -> Result<Json<ApiResponse<FollowStatusResponse>>, StatusCode> {
    tracing::info!("Follow request: {} -> {}", request.follower_id, user_id);

    match app_state.db.follow_user(&request.follower_id, &user_id).await {
        Ok(_followed) => {
            let (followers_count, _) = app_state.db.get_follow_counts(&user_id).await;
            let (_, following_count) = app_state.db.get_follow_counts(&request.follower_id).await;

            let response = FollowStatusResponse {
                is_following: true,
                followers_count,
                following_count,
            };
            Ok(Json(ApiResponse::success(response)))
        }
        Err(e) => {
            tracing::error!("Failed to follow user: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn unfollow_user(
    State(app_state): State<AppState>,
    Path(user_id): Path<uuid::Uuid>,
    Json(request): Json<FollowRequest>,
) -> Result<Json<ApiResponse<FollowStatusResponse>>, StatusCode> {
    tracing::info!("Unfollow request: {} -> {}", request.follower_id, user_id);

    match app_state.db.unfollow_user(&request.follower_id, &user_id).await {
        Ok(_unfollowed) => {
            let (followers_count, _) = app_state.db.get_follow_counts(&user_id).await;
            let (_, following_count) = app_state.db.get_follow_counts(&request.follower_id).await;

            let response = FollowStatusResponse {
                is_following: false,
                followers_count,
                following_count,
            };
            Ok(Json(ApiResponse::success(response)))
        }
        Err(e) => {
            tracing::error!("Failed to unfollow user: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn get_follow_status(
    State(app_state): State<AppState>,
    Path(user_id): Path<uuid::Uuid>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<Json<ApiResponse<FollowStatusResponse>>, StatusCode> {
    let follower_id_str = params.get("follower_id").ok_or(StatusCode::BAD_REQUEST)?;
    let follower_id = uuid::Uuid::parse_str(follower_id_str).map_err(|_| StatusCode::BAD_REQUEST)?;

    let is_following = app_state.db.is_following(&follower_id, &user_id).await;
    let (followers_count, _) = app_state.db.get_follow_counts(&user_id).await;
    let (_, following_count) = app_state.db.get_follow_counts(&follower_id).await;

    let response = FollowStatusResponse {
        is_following,
        followers_count,
        following_count,
    };

    Ok(Json(ApiResponse::success(response)))
}

// ============================================================================
// Media Upload Endpoints (R2)
// ============================================================================

fn api_error<T>(status: StatusCode, message: &str) -> (StatusCode, Json<ApiResponse<T>>) {
    (status, Json(ApiResponse::error(message.to_string())))
}

/// Upload a single media file to R2
pub async fn upload_media(
    State(app_state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<ApiResponse<MediaUploadResponse>>, (StatusCode, Json<ApiResponse<MediaUploadResponse>>)> {
    tracing::info!("📤 Media upload request received");

    // Check if R2 is configured
    let r2_client = match &app_state.r2_client {
        Some(client) => client,
        None => {
            if let Some(message) = &app_state.r2_error {
                tracing::error!("R2 client not configured: {}", message);
                return Err(api_error(
                    StatusCode::SERVICE_UNAVAILABLE,
                    &format!("R2 client not configured: {}", message),
                ));
            }
            tracing::error!("R2 client not configured (no details)");
            return Err(api_error(StatusCode::SERVICE_UNAVAILABLE, "R2 client not configured"));
        }
    };

    // Parse multipart form data
    let mut user_id: Option<String> = None;
    let mut file_data: Option<Vec<u8>> = None;
    let mut content_type: Option<String> = None;

    while let Some(field) = multipart.next_field().await.map_err(|e| {
        tracing::error!("Failed to read multipart field: {}", e);
        api_error(StatusCode::BAD_REQUEST, "Failed to read multipart field")
    })? {
        let field_name = field.name().unwrap_or("").to_string();

        match field_name.as_str() {
            "file" => {
                content_type = field
                    .content_type()
                    .map(|ct| ct.to_string());

                let data = field.bytes().await.map_err(|e| {
                    tracing::error!("Failed to read file data: {}", e);
                    api_error(StatusCode::BAD_REQUEST, "Failed to read file data")
                })?;

                file_data = Some(data.to_vec());
            }
            "user_id" => {
                let text = field
                    .text()
                    .await
                    .map_err(|_| api_error(StatusCode::BAD_REQUEST, "Invalid user_id"))?;
                user_id = Some(text);
            }
            _ => {}
        }
    }

    // Validate required fields
    let file_data = file_data.ok_or_else(|| {
        tracing::error!("No file data in upload request");
        api_error(StatusCode::BAD_REQUEST, "No file data in upload request")
    })?;

    let content_type = content_type.ok_or_else(|| {
        tracing::error!("No content type in upload request");
        api_error(StatusCode::BAD_REQUEST, "No content type in upload request")
    })?;

    let user_id = user_id.ok_or_else(|| {
        tracing::error!("No user_id in upload request");
        api_error(StatusCode::BAD_REQUEST, "No user_id in upload request")
    })?;

    // Validate content type
    if !crate::r2_client::is_valid_content_type(&content_type) {
        tracing::warn!("Invalid content type: {}", content_type);
        return Err(api_error(
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "Unsupported content type",
        ));
    }

    // Validate file size (10 MB for images, 50 MB for videos)
    let max_size = if content_type.starts_with("video/") {
        50 * 1024 * 1024
    } else {
        10 * 1024 * 1024
    };

    if file_data.len() > max_size {
        tracing::warn!("File too large: {} bytes (max: {} bytes)", file_data.len(), max_size);
        return Err(api_error(StatusCode::PAYLOAD_TOO_LARGE, "File too large"));
    }

    tracing::info!(
        "Uploading file: user={}, size={} bytes, type={}",
        user_id,
        file_data.len(),
        content_type
    );

    // Upload to R2
    match r2_client.upload_file(file_data.clone(), &content_type, &user_id).await {
        Ok((file_key, public_url, checksum)) => {
            let response = MediaUploadResponse {
                file_key,
                public_url,
                content_type,
                size_bytes: file_data.len() as u64,
                checksum,
            };

            tracing::info!("✅ Upload successful: {}", response.public_url);
            Ok(Json(ApiResponse::success(response)))
        }
        Err(e) => {
            tracing::error!("❌ Upload failed: {}", e);
            Err(api_error(
                StatusCode::BAD_GATEWAY,
                "Failed to upload file to R2",
            ))
        }
    }
}

/// Batch upload multiple media files to R2
pub async fn batch_upload_media(
    State(app_state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<ApiResponse<Vec<MediaUploadResponse>>>, (StatusCode, Json<ApiResponse<Vec<MediaUploadResponse>>>)> {
    tracing::info!("📤 Batch media upload request received");
    tracing::info!("Parsing multipart fields...");

    // Check if R2 is configured
    let r2_client = match &app_state.r2_client {
        Some(client) => client,
        None => {
            if let Some(message) = &app_state.r2_error {
                tracing::error!("R2 client not configured: {}", message);
                return Err(api_error(
                    StatusCode::SERVICE_UNAVAILABLE,
                    &format!("R2 client not configured: {}", message),
                ));
            }
            tracing::error!("R2 client not configured (no details)");
            return Err(api_error(
                StatusCode::SERVICE_UNAVAILABLE,
                "R2 client not configured",
            ));
        }
    };

    let mut files: Vec<(Vec<u8>, String)> = Vec::new(); // (data, content_type)
    let mut user_id: Option<String> = None;

    // Parse multipart form data
    while let Some(field) = multipart.next_field().await.map_err(|e| {
        tracing::error!("Failed to read multipart field: {}", e);
        api_error(StatusCode::BAD_REQUEST, "Failed to read multipart field")
    })? {
        let field_name = field.name().unwrap_or("").to_string();

        if field_name.starts_with("file_") {
            let content_type = field
                .content_type()
                .map(|ct| ct.to_string())
                .unwrap_or_else(|| "application/octet-stream".to_string());

            if !crate::r2_client::is_valid_content_type(&content_type) {
                tracing::warn!("Invalid content type in batch: {}", content_type);
                return Err(api_error(
                    StatusCode::UNSUPPORTED_MEDIA_TYPE,
                    "Unsupported content type",
                ));
            }

            let data = field.bytes().await.map_err(|e| {
                tracing::error!("Failed to read file data: {}", e);
                api_error(StatusCode::BAD_REQUEST, "Failed to read file data")
            })?;

            // Validate file size
            let max_size = if content_type.starts_with("video/") {
                50 * 1024 * 1024
            } else {
                10 * 1024 * 1024
            };

            if data.len() > max_size {
                tracing::warn!("File too large in batch: {} bytes (max: {} bytes)", data.len(), max_size);
                return Err(api_error(StatusCode::PAYLOAD_TOO_LARGE, "File too large"));
            }

            files.push((data.to_vec(), content_type));
        } else if field_name == "user_id" {
            let text = field
                .text()
                .await
                .map_err(|_| api_error(StatusCode::BAD_REQUEST, "Invalid user_id"))?;
            user_id = Some(text);
        }
    }

    let user_id = user_id.ok_or_else(|| {
        tracing::error!("No user_id in batch upload request");
        api_error(StatusCode::BAD_REQUEST, "No user_id in batch upload request")
    })?;

    // Validate batch
    if files.is_empty() {
        tracing::warn!("No files found in batch upload request");
        return Err(api_error(StatusCode::BAD_REQUEST, "No files in upload request"));
    }

    if files.len() > 9 {
        tracing::warn!("Too many files in batch: {} (max: 9)", files.len());
        return Err(api_error(StatusCode::BAD_REQUEST, "Too many files in upload"));
    }

    let total_size: usize = files.iter().map(|(data, _)| data.len()).sum();
    if total_size > 100 * 1024 * 1024 {
        tracing::warn!("Batch too large: {} bytes (max: 100 MB)", total_size);
        return Err(api_error(StatusCode::PAYLOAD_TOO_LARGE, "Batch too large"));
    }

    tracing::info!("Batch upload: {} files, total size: {} bytes, user: {}",
        files.len(), total_size, user_id);

    // Upload all files
    let mut results: Vec<MediaUploadResponse> = Vec::new();

    for (index, (data, content_type)) in files.into_iter().enumerate() {
        tracing::info!("Uploading file {}/{}", index + 1, results.len() + 1);

        match r2_client.upload_file(data.clone(), &content_type, &user_id).await {
            Ok((file_key, public_url, checksum)) => {
                let response = MediaUploadResponse {
                    file_key,
                    public_url,
                    content_type,
                    size_bytes: data.len() as u64,
                    checksum,
                };

                tracing::info!("✅ File {} uploaded: {}", index + 1, response.public_url);
                results.push(response);
            }
            Err(e) => {
                tracing::error!("❌ Failed to upload file {}: {}", index + 1, e);
                return Err(api_error(
                    StatusCode::BAD_GATEWAY,
                    "Failed to upload batch to R2",
                ));
            }
        }
    }

    tracing::info!("✅ Batch upload completed: {} files", results.len());
    Ok(Json(ApiResponse::success(results)))
}
