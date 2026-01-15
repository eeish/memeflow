use crate::{models::*, AppState};
use axum::{
    extract::{Multipart, Path, Query, State},
    http::StatusCode,
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

    // Protocol content and media uploads not yet implemented
    let content_blob_id: Option<String> = None;

    // Create post in database (with or without blob ID)
    match app_state.db.create_post(request).await {
        Ok(mut post) => {
            // Update post with blob ID if we uploaded to Walrus
            if let Some(blob_id) = content_blob_id {
                post.content_blob_id = Some(blob_id);
                post.content_protocol_version = Some("1.0".to_string());
            }

            log::info!("Post created successfully: id={}, has_walrus_content={}",
                post.id, post.content_blob_id.is_some());
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
    log::info!("📤 Media upload request received");

    // Check if R2 is configured
    let r2_client = match &app_state.r2_client {
        Some(client) => client,
        None => {
            if let Some(message) = &app_state.r2_error {
                log::error!("R2 client not configured: {}", message);
                return Err(api_error(
                    StatusCode::SERVICE_UNAVAILABLE,
                    &format!("R2 client not configured: {}", message),
                ));
            }
            log::error!("R2 client not configured (no details)");
            return Err(api_error(StatusCode::SERVICE_UNAVAILABLE, "R2 client not configured"));
        }
    };

    // Parse multipart form data
    let mut user_id: Option<String> = None;
    let mut file_data: Option<Vec<u8>> = None;
    let mut content_type: Option<String> = None;

    while let Some(field) = multipart.next_field().await.map_err(|e| {
        log::error!("Failed to read multipart field: {}", e);
        api_error(StatusCode::BAD_REQUEST, "Failed to read multipart field")
    })? {
        let field_name = field.name().unwrap_or("").to_string();

        match field_name.as_str() {
            "file" => {
                content_type = field
                    .content_type()
                    .map(|ct| ct.to_string());

                let data = field.bytes().await.map_err(|e| {
                    log::error!("Failed to read file data: {}", e);
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
        log::error!("No file data in upload request");
        api_error(StatusCode::BAD_REQUEST, "No file data in upload request")
    })?;

    let content_type = content_type.ok_or_else(|| {
        log::error!("No content type in upload request");
        api_error(StatusCode::BAD_REQUEST, "No content type in upload request")
    })?;

    let user_id = user_id.ok_or_else(|| {
        log::error!("No user_id in upload request");
        api_error(StatusCode::BAD_REQUEST, "No user_id in upload request")
    })?;

    // Validate content type
    if !crate::r2_client::is_valid_content_type(&content_type) {
        log::warn!("Invalid content type: {}", content_type);
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
        log::warn!("File too large: {} bytes (max: {} bytes)", file_data.len(), max_size);
        return Err(api_error(StatusCode::PAYLOAD_TOO_LARGE, "File too large"));
    }

    log::info!(
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

            log::info!("✅ Upload successful: {}", response.public_url);
            Ok(Json(ApiResponse::success(response)))
        }
        Err(e) => {
            log::error!("❌ Upload failed: {}", e);
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
    log::info!("📤 Batch media upload request received");
    log::info!("Parsing multipart fields...");

    // Check if R2 is configured
    let r2_client = match &app_state.r2_client {
        Some(client) => client,
        None => {
            if let Some(message) = &app_state.r2_error {
                log::error!("R2 client not configured: {}", message);
                return Err(api_error(
                    StatusCode::SERVICE_UNAVAILABLE,
                    &format!("R2 client not configured: {}", message),
                ));
            }
            log::error!("R2 client not configured (no details)");
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
        log::error!("Failed to read multipart field: {}", e);
        api_error(StatusCode::BAD_REQUEST, "Failed to read multipart field")
    })? {
        let field_name = field.name().unwrap_or("").to_string();

        if field_name.starts_with("file_") {
            let content_type = field
                .content_type()
                .map(|ct| ct.to_string())
                .unwrap_or_else(|| "application/octet-stream".to_string());

            if !crate::r2_client::is_valid_content_type(&content_type) {
                log::warn!("Invalid content type in batch: {}", content_type);
                return Err(api_error(
                    StatusCode::UNSUPPORTED_MEDIA_TYPE,
                    "Unsupported content type",
                ));
            }

            let data = field.bytes().await.map_err(|e| {
                log::error!("Failed to read file data: {}", e);
                api_error(StatusCode::BAD_REQUEST, "Failed to read file data")
            })?;

            // Validate file size
            let max_size = if content_type.starts_with("video/") {
                50 * 1024 * 1024
            } else {
                10 * 1024 * 1024
            };

            if data.len() > max_size {
                log::warn!("File too large in batch: {} bytes (max: {} bytes)", data.len(), max_size);
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
        log::error!("No user_id in batch upload request");
        api_error(StatusCode::BAD_REQUEST, "No user_id in batch upload request")
    })?;

    // Validate batch
    if files.is_empty() {
        log::warn!("No files found in batch upload request");
        return Err(api_error(StatusCode::BAD_REQUEST, "No files in upload request"));
    }

    if files.len() > 9 {
        log::warn!("Too many files in batch: {} (max: 9)", files.len());
        return Err(api_error(StatusCode::BAD_REQUEST, "Too many files in upload"));
    }

    let total_size: usize = files.iter().map(|(data, _)| data.len()).sum();
    if total_size > 100 * 1024 * 1024 {
        log::warn!("Batch too large: {} bytes (max: 100 MB)", total_size);
        return Err(api_error(StatusCode::PAYLOAD_TOO_LARGE, "Batch too large"));
    }

    log::info!("Batch upload: {} files, total size: {} bytes, user: {}",
        files.len(), total_size, user_id);

    // Upload all files
    let mut results: Vec<MediaUploadResponse> = Vec::new();

    for (index, (data, content_type)) in files.into_iter().enumerate() {
        log::info!("Uploading file {}/{}", index + 1, results.len() + 1);

        match r2_client.upload_file(data.clone(), &content_type, &user_id).await {
            Ok((file_key, public_url, checksum)) => {
                let response = MediaUploadResponse {
                    file_key,
                    public_url,
                    content_type,
                    size_bytes: data.len() as u64,
                    checksum,
                };

                log::info!("✅ File {} uploaded: {}", index + 1, response.public_url);
                results.push(response);
            }
            Err(e) => {
                log::error!("❌ Failed to upload file {}: {}", index + 1, e);
                return Err(api_error(
                    StatusCode::BAD_GATEWAY,
                    "Failed to upload batch to R2",
                ));
            }
        }
    }

    log::info!("✅ Batch upload completed: {} files", results.len());
    Ok(Json(ApiResponse::success(results)))
}
