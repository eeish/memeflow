use crate::{models::*, sui_verification::AddressVerificationResult, AppState};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json,
};
use serde::Deserialize;
use uuid::Uuid;

#[derive(Deserialize)]
pub struct PlazaQuery {
    pub limit: Option<i32>,
    pub offset: Option<i32>,
}

// Health check endpoint
pub async fn health_check() -> Json<ApiResponse<String>> {
    Json(ApiResponse::success("MemeFlow Service is running! 🚀".to_string()))
}

// Plaza - Global feed endpoint (Twitter-like public timeline)
pub async fn get_plaza_posts(
    State(app_state): State<AppState>,
    Query(params): Query<PlazaQuery>,
) -> Json<ApiResponse<Vec<PostWithAuthor>>> {
    log::info!("Getting plaza posts with limit={:?}, offset={:?}", 
        params.limit, params.offset);
    
    match app_state.db.get_plaza_posts(params.limit, params.offset).await {
        Ok(posts) => {
            log::info!("Retrieved {} posts for plaza", posts.len());
            Json(ApiResponse::success(posts))
        }
        Err(e) => {
            log::error!("Failed to get plaza posts: {}", e);
            Json(ApiResponse::error("Failed to retrieve plaza posts".to_string()))
        }
    }
}

// User endpoints
pub async fn create_user(
    State(app_state): State<AppState>,
    Json(request): Json<CreateUserRequest>,
) -> Json<ApiResponse<User>> {
    log::info!("Creating new user: wallet_address={:?}, username={}", 
        request.wallet_address, request.username);
    
    // If wallet address is provided, verify it first
    if let Some(ref wallet_address) = request.wallet_address {
        // Validate address format
        if !crate::sui_verification::SuiVerification::validate_address_format(wallet_address) {
            log::warn!("Invalid wallet address format: {}", wallet_address);
            return Json(ApiResponse::error("Invalid wallet address format".to_string()));
        }
        
        // Check if user already exists with this address
        let db_read = app_state.db.read().await;
        match app_state.sui_verification.is_new_user_in_db(&db_read, wallet_address).await {
            Ok(is_new) => {
                if !is_new {
                    log::warn!("User already exists with wallet address: {}", wallet_address);
                    return Json(ApiResponse::error("User already exists with this wallet address".to_string()));
                }
            }
            Err(e) => {
                log::error!("Failed to check user existence: {}", e);
                return Json(ApiResponse::error("Failed to check user existence".to_string()));
            }
        }
        drop(db_read);
        
        // Verify the address and get on-chain data
        let db_read = app_state.db.read().await;
        let verification_result = app_state.sui_verification
            .verify_user_address(&db_read, wallet_address)
            .await;
        drop(db_read);
        
        if !verification_result.is_valid {
            log::warn!("Address verification failed: {:?}", verification_result.error);
            return Json(ApiResponse::error("Address verification failed".to_string()));
        }
        
        // Log verification details for debugging
        log::info!("Address verification successful: is_new_user={}, on_chain_active={:?}", 
            verification_result.is_new_user,
            verification_result.on_chain_data.as_ref().map(|d| d.is_active));
    }
    
    let mut db = app_state.db.write().await;
    
    match db.create_user(request).await {
        Ok(user) => {
            log::info!("Successfully created user: id={}, username={}, token_symbol={}", 
                user.id, user.username, user.token_symbol);
            Json(ApiResponse::success(user))
        }
        Err(e) => {
            log::error!("Failed to create user: {}", e);
            Json(ApiResponse::error("Failed to create user".to_string()))
        }
    }
}

pub async fn get_user(
    State(app_state): State<AppState>,
    Path(user_id): Path<Uuid>,
) -> Result<Json<ApiResponse<User>>, StatusCode> {
    let db = app_state.db.read().await;
    
    match db.get_user(&user_id).await {
        Some(user) => Ok(Json(ApiResponse::success(user))),
        None => Err(StatusCode::NOT_FOUND),
    }
}

pub async fn update_user_profile(
    State(app_state): State<AppState>,
    Path(user_id): Path<Uuid>,
    Json(request): Json<UpdateProfileRequest>,
) -> Result<Json<ApiResponse<User>>, StatusCode> {
    let mut db = app_state.db.write().await;
    
    match db.update_user_profile(&user_id, request).await {
        Ok(Some(user)) => Ok(Json(ApiResponse::success(user))),
        Ok(None) => Err(StatusCode::NOT_FOUND),
        Err(e) => {
            log::error!("Failed to update user profile: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

// Post endpoints
#[derive(Deserialize)]
pub struct GetPostsQuery {
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

pub async fn get_posts(
    State(app_state): State<AppState>,
    Query(params): Query<GetPostsQuery>,
) -> Json<ApiResponse<Vec<PostWithAuthor>>> {
    let db = app_state.db.read().await;
    
    let limit = params.limit.unwrap_or(20).min(100);
    let offset = params.offset.unwrap_or(0);
    
    let posts = db.get_posts(limit, offset).await;
    Json(ApiResponse::success(posts))
}

pub async fn create_post(
    State(app_state): State<AppState>,
    Json(request): Json<CreatePostRequest>,
) -> Result<Json<ApiResponse<Post>>, StatusCode> {
    let mut db = app_state.db.write().await;
    
    match db.create_post(request).await {
        Ok(post) => Ok(Json(ApiResponse::success(post))),
        Err(e) => {
            log::error!("Failed to create post: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn like_post(
    State(app_state): State<AppState>,
    Path(post_id): Path<Uuid>,
    Json(request): Json<LikeRequest>,
) -> Result<Json<ApiResponse<bool>>, StatusCode> {
    let mut db = app_state.db.write().await;
    
    match db.like_post(&post_id, &request.user_id).await {
        Ok(liked) => Ok(Json(ApiResponse::success(liked))),
        Err(e) => {
            log::error!("Failed to like post: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn comment_post(
    State(app_state): State<AppState>,
    Path(_post_id): Path<Uuid>,
    Json(_request): Json<CreateCommentRequest>,
) -> Json<ApiResponse<String>> {
    // TODO: Implement comment functionality
    Json(ApiResponse::success("Comment functionality coming soon!".to_string()))
}

// Token metadata endpoints
pub async fn get_token_metadata(
    State(app_state): State<AppState>,
    Path(symbol): Path<String>,
) -> Result<Json<ApiResponse<TokenMetadata>>, StatusCode> {
    let db = app_state.db.read().await;
    
    match db.get_token_metadata(&symbol.to_uppercase()).await {
        Some(metadata) => Ok(Json(ApiResponse::success(metadata))),
        None => Err(StatusCode::NOT_FOUND),
    }
}

pub async fn update_token_metadata(
    State(app_state): State<AppState>,
    Path(symbol): Path<String>,
    Json(request): Json<UpdateTokenMetadataRequest>,
) -> Result<Json<ApiResponse<TokenMetadata>>, StatusCode> {
    let mut db = app_state.db.write().await;
    
    match db.update_token_metadata(&symbol.to_uppercase(), request).await {
        Ok(Some(metadata)) => Ok(Json(ApiResponse::success(metadata))),
        Ok(None) => Err(StatusCode::NOT_FOUND),
        Err(e) => {
            log::error!("Failed to update token metadata: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

#[derive(Deserialize)]
pub struct TrendingQuery {
    pub limit: Option<usize>,
}

pub async fn get_trending_tokens(
    State(app_state): State<AppState>,
    Query(params): Query<TrendingQuery>,
) -> Json<ApiResponse<Vec<TokenMetadata>>> {
    let db = app_state.db.read().await;
    
    let limit = params.limit.unwrap_or(10).min(50);
    let tokens = db.get_trending_tokens(limit).await;
    
    Json(ApiResponse::success(tokens))
}

// Search endpoints
pub async fn search_users(
    State(app_state): State<AppState>,
    Query(params): Query<SearchQuery>,
) -> Json<ApiResponse<Vec<UserProfile>>> {
    let db = app_state.db.read().await;
    
    let limit = params.limit.unwrap_or(20).min(100);
    let offset = params.offset.unwrap_or(0);
    
    let users = db.search_users(&params.q, limit, offset).await;
    Json(ApiResponse::success(users))
}

pub async fn search_tokens(
    State(app_state): State<AppState>,
    Query(params): Query<SearchQuery>,
) -> Json<ApiResponse<Vec<TokenMetadata>>> {
    let db = app_state.db.read().await;
    
    let limit = params.limit.unwrap_or(20).min(100);
    let offset = params.offset.unwrap_or(0);
    
    let tokens = db.search_tokens(&params.q, limit, offset).await;
    Json(ApiResponse::success(tokens))
}

// Analytics endpoints
pub async fn get_user_analytics(
    State(app_state): State<AppState>,
) -> Json<ApiResponse<Analytics>> {
    let db = app_state.db.read().await;
    
    let total_users = db.users.len() as i64;
    let total_posts = db.posts.len() as i64;
    let total_tokens = db.token_metadata.len() as i64;
    
    // Get top users by followers
    let mut users: Vec<_> = db.users.values().collect();
    users.sort_by(|a, b| b.followers_count.cmp(&a.followers_count));
    let top_users = users.into_iter()
        .take(5)
        .map(|user| UserProfile {
            id: user.id,
            username: user.username.clone(),
            display_name: user.display_name.clone(),
            avatar_url: user.avatar_url.clone(),
            token_symbol: user.token_symbol.clone(),
        })
        .collect();
    
    // Get top tokens by market cap
    let top_tokens = db.get_trending_tokens(5).await;
    
    let analytics = Analytics {
        total_users,
        total_posts,
        total_tokens,
        active_users_24h: total_users, // Simplified for demo
        posts_24h: total_posts, // Simplified for demo
        top_tokens,
        top_users,
    };
    
    Json(ApiResponse::success(analytics))
}

pub async fn get_token_analytics(
    State(_app_state): State<AppState>,
) -> Json<ApiResponse<String>> {
    // TODO: Implement detailed token analytics
    Json(ApiResponse::success("Token analytics coming soon!".to_string()))
}

// Follow/Unfollow endpoints
pub async fn follow_user(
    State(app_state): State<AppState>,
    Path(user_id): Path<Uuid>,
    Json(request): Json<FollowRequest>,
) -> Result<Json<ApiResponse<FollowStatusResponse>>, StatusCode> {
    let mut db = app_state.db.write().await;
    
    match db.follow_user(&request.follower_id, &user_id).await {
        Ok(followed) => {
            let user = db.get_user(&user_id).await;
            let follower = db.get_user(&request.follower_id).await;
            
            let response = FollowStatusResponse {
                is_following: followed,
                followers_count: user.map(|u| u.followers_count).unwrap_or(0),
                following_count: follower.map(|u| u.following_count).unwrap_or(0),
            };
            
            Ok(Json(ApiResponse::success(response)))
        }
        Err(e) => {
            log::error!("Failed to follow user: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn unfollow_user(
    State(app_state): State<AppState>,
    Path(user_id): Path<Uuid>,
    Json(request): Json<FollowRequest>,
) -> Result<Json<ApiResponse<FollowStatusResponse>>, StatusCode> {
    let mut db = app_state.db.write().await;
    
    match db.unfollow_user(&request.follower_id, &user_id).await {
        Ok(unfollowed) => {
            let user = db.get_user(&user_id).await;
            let follower = db.get_user(&request.follower_id).await;
            
            let response = FollowStatusResponse {
                is_following: !unfollowed,
                followers_count: user.map(|u| u.followers_count).unwrap_or(0),
                following_count: follower.map(|u| u.following_count).unwrap_or(0),
            };
            
            Ok(Json(ApiResponse::success(response)))
        }
        Err(e) => {
            log::error!("Failed to unfollow user: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn get_follow_status(
    State(app_state): State<AppState>,
    Path(user_id): Path<Uuid>,
    Query(follower_query): Query<std::collections::HashMap<String, String>>,
) -> Result<Json<ApiResponse<FollowStatusResponse>>, StatusCode> {
    let follower_id_str = follower_query.get("follower_id").ok_or(StatusCode::BAD_REQUEST)?;
    let follower_id = Uuid::parse_str(follower_id_str).map_err(|_| StatusCode::BAD_REQUEST)?;
    
    let db = app_state.db.read().await;
    
    let is_following = db.is_following(&follower_id, &user_id).await;
    let user = db.get_user(&user_id).await;
    let follower = db.get_user(&follower_id).await;
    
    let response = FollowStatusResponse {
        is_following,
        followers_count: user.map(|u| u.followers_count).unwrap_or(0),
        following_count: follower.map(|u| u.following_count).unwrap_or(0),
    };
    
    Ok(Json(ApiResponse::success(response)))
}

pub async fn get_user_followers(
    State(app_state): State<AppState>,
    Path(user_id): Path<Uuid>,
) -> Json<ApiResponse<Vec<UserProfile>>> {
    let db = app_state.db.read().await;
    let followers = db.get_followers(&user_id).await;
    Json(ApiResponse::success(followers))
}

pub async fn get_user_following(
    State(app_state): State<AppState>,
    Path(user_id): Path<Uuid>,
) -> Json<ApiResponse<Vec<UserProfile>>> {
    let db = app_state.db.read().await;
    let following = db.get_following(&user_id).await;
    Json(ApiResponse::success(following))
}

// News feed endpoint
pub async fn get_news_feed(
    State(app_state): State<AppState>,
    Path(user_id): Path<Uuid>,
    Query(params): Query<GetPostsQuery>,
) -> Json<ApiResponse<Vec<PostWithAuthor>>> {
    let db = app_state.db.read().await;
    
    let limit = params.limit.unwrap_or(20).min(100);
    let offset = params.offset.unwrap_or(0);
    
    let feed = db.get_news_feed(&user_id, limit, offset).await;
    Json(ApiResponse::success(feed))
}

// Notification endpoints
pub async fn get_user_notifications(
    State(app_state): State<AppState>,
    Path(user_id): Path<Uuid>,
) -> Json<ApiResponse<Vec<Notification>>> {
    let db = app_state.db.read().await;
    let notifications = db.get_user_notifications(&user_id).await;
    Json(ApiResponse::success(notifications))
}

pub async fn mark_notification_read(
    State(app_state): State<AppState>,
    Path(notification_id): Path<Uuid>,
) -> Result<Json<ApiResponse<String>>, StatusCode> {
    let mut db = app_state.db.write().await;
    
    match db.mark_notification_read(&notification_id).await {
        Ok(true) => Ok(Json(ApiResponse::success("Notification marked as read".to_string()))),
        Ok(false) => Err(StatusCode::NOT_FOUND),
        Err(e) => {
            log::error!("Failed to mark notification as read: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

// Sui Address Verification Endpoints

/// Verify a Sui address and check if user is new
pub async fn verify_sui_address(
    State(app_state): State<AppState>,
    Path(address): Path<String>,
) -> Json<ApiResponse<AddressVerificationResult>> {
    log::info!("Verifying Sui address: {}", address);
    
    let db = app_state.db.read().await;
    let result = app_state.sui_verification
        .verify_user_address(&db, &address)
        .await;
    
    log::info!("Address verification result for {}: new_user={}, valid={}", 
        address, result.is_new_user, result.is_valid);
    
    Json(ApiResponse::success(result))
}

/// Check if a user exists by Sui address (lightweight check)
pub async fn check_user_exists_by_address(
    State(app_state): State<AppState>,
    Path(address): Path<String>,
) -> Result<Json<ApiResponse<bool>>, StatusCode> {
    log::info!("Checking if user exists for address: {}", address);
    
    // Validate address format first
    if !crate::sui_verification::SuiVerification::validate_address_format(&address) {
        return Err(StatusCode::BAD_REQUEST);
    }
    
    let db = app_state.db.read().await;
    
    match app_state.sui_verification.is_new_user_in_db(&db, &address).await {
        Ok(is_new) => {
            let user_exists = !is_new;
            log::info!("User exists check for {}: {}", address, user_exists);
            Ok(Json(ApiResponse::success(user_exists)))
        }
        Err(e) => {
            log::error!("Error checking user existence: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

/// Get user by Sui address
pub async fn get_user_by_address(
    State(app_state): State<AppState>,
    Path(address): Path<String>,
) -> Result<Json<ApiResponse<User>>, StatusCode> {
    log::info!("Getting user by address: {}", address);
    
    // Validate and normalize address
    let normalized_address = match crate::sui_verification::SuiVerification::normalize_address(&address) {
        Ok(addr) => addr,
        Err(_) => return Err(StatusCode::BAD_REQUEST),
    };
    
    let db = app_state.db.read().await;
    
    // Find user with matching wallet address
    let user = db.users.values()
        .find(|user| {
            user.wallet_address.as_ref()
                .and_then(|addr| crate::sui_verification::SuiVerification::normalize_address(addr).ok())
                .as_ref() == Some(&normalized_address)
        });
    
    match user {
        Some(user) => {
            log::info!("Found user for address {}: {}", address, user.username);
            Ok(Json(ApiResponse::success(user.clone())))
        }
        None => {
            log::info!("No user found for address: {}", address);
            Err(StatusCode::NOT_FOUND)
        }
    }
}