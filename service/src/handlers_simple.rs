use crate::{models::*, AppState};
use axum::{
    extract::{Path, Query, State},
    response::Json,
};
use serde::Deserialize;

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

// User verification endpoints (required for authentication)
pub async fn check_user_exists_by_address(
    State(app_state): State<AppState>,
    Path(address): Path<String>,
) -> Json<ApiResponse<bool>> {
    log::info!("Checking if user exists with address: {}", address);
    
    match app_state.db.user_exists_by_address(&address).await {
        Ok(exists) => {
            Json(ApiResponse::success(exists))
        }
        Err(e) => {
            log::error!("Failed to check user existence: {}", e);
            Json(ApiResponse::error("Failed to check user existence".to_string()))
        }
    }
}

pub async fn get_user_by_address(
    State(app_state): State<AppState>,
    Path(address): Path<String>,
) -> Json<ApiResponse<User>> {
    log::info!("Getting user by address: {}", address);
    
    match app_state.db.get_user_by_address(&address).await {
        Ok(Some(user)) => {
            Json(ApiResponse::success(user))
        }
        Ok(None) => {
            Json(ApiResponse::error("User not found".to_string()))
        }
        Err(e) => {
            log::error!("Failed to get user by address: {}", e);
            Json(ApiResponse::error("Failed to retrieve user".to_string()))
        }
    }
}

pub async fn create_user(
    State(app_state): State<AppState>,
    Json(request): Json<CreateUserRequest>,
) -> Json<ApiResponse<User>> {
    log::info!("Creating new user: wallet_address={:?}, username={}", 
        request.wallet_address, request.username);
    
    match app_state.db.create_user(request).await {
        Ok(user) => {
            log::info!("User created successfully: {}", user.id);
            Json(ApiResponse::success(user))
        }
        Err(e) => {
            log::error!("Failed to create user: {}", e);
            Json(ApiResponse::error("Failed to create user".to_string()))
        }
    }
}

// News feed endpoint (for now, returns same as Plaza but can be personalized later)
pub async fn get_news_feed(
    State(app_state): State<AppState>,
    Path(user_id): Path<String>,
    Query(params): Query<PlazaQuery>,
) -> Json<ApiResponse<Vec<PostWithAuthor>>> {
    log::info!("Getting news feed for user: {} with limit={:?}, offset={:?}", 
        user_id, params.limit, params.offset);
    
    // For now, return the same as Plaza (all posts)
    // In the future, this could be personalized based on who the user follows
    match app_state.db.get_plaza_posts(params.limit, params.offset).await {
        Ok(posts) => {
            log::info!("Retrieved {} posts for user feed", posts.len());
            Json(ApiResponse::success(posts))
        }
        Err(e) => {
            log::error!("Failed to get user feed: {}", e);
            Json(ApiResponse::error("Failed to retrieve news feed".to_string()))
        }
    }
}

// Create post endpoint
pub async fn create_post(
    State(app_state): State<AppState>,
    Json(request): Json<CreatePostRequest>,
) -> Json<ApiResponse<Post>> {
    log::info!("Creating new post: author_id={}, content_length={}", 
        request.author_id, request.content.len());
    
    match app_state.db.create_post(request).await {
        Ok(post) => {
            log::info!("Post created successfully: {}", post.id);
            Json(ApiResponse::success(post))
        }
        Err(e) => {
            log::error!("Failed to create post: {}", e);
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
    log::info!("Toggling like for post: {} by user: {}", post_id, request.user_id);
    
    match app_state.db.like_post(&post_id, &request.user_id).await {
        Ok(is_liked) => {
            log::info!("Like toggled successfully: post={}, is_liked={}", post_id, is_liked);
            Json(ApiResponse::success(is_liked))
        }
        Err(e) => {
            log::error!("Failed to toggle like: {}", e);
            Json(ApiResponse::error("Failed to like post".to_string()))
        }
    }
}