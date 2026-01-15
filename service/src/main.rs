use axum::{
    routing::{get, post},
    Router,
};
use tower_http::cors::{Any, CorsLayer};
use tower_http::limit::RequestBodyLimitLayer;
use std::sync::Arc;

mod models;
mod handlers_simple;
mod database_sqlite;
mod sui_verification;
mod r2_client;

use database_sqlite as database;
use handlers_simple::*;

// Application state
#[derive(Clone)]
pub struct AppState {
    pub db: Arc<database::Database>,
    pub sui_verification: Arc<sui_verification::SuiVerification>,
    pub r2_client: Option<Arc<r2_client::R2Client>>,
    pub r2_error: Option<String>,
}

#[tokio::main]
async fn main() {
    // Load .env file if it exists (prefer service/.env when running from repo root)
    if dotenvy::from_filename("service/.env").is_err() {
        let _ = dotenvy::dotenv();
    }

    // Initialize logger
    env_logger::init();

    // Initialize database
    let db = Arc::new(database::Database::new().await.expect("Failed to initialize database"));

    // Initialize Sui verification service
    let network_url = std::env::var("SUI_NETWORK_URL").ok();
    let sui_verification = match sui_verification::SuiVerification::with_client(network_url.as_deref()).await {
        Ok(service) => {
            log::info!("Sui verification service initialized with blockchain client");
            Arc::new(service)
        }
        Err(e) => {
            log::warn!("Failed to initialize Sui client, using offline mode: {}", e);
            Arc::new(sui_verification::SuiVerification::new())
        }
    };

    // Initialize R2 client (optional - if credentials are not set, uploads will be disabled)
    let mut r2_error: Option<String> = None;
    let r2_client = match r2_client::R2Client::from_env().await {
        Ok(client) => {
            log::info!("✅ R2 client initialized successfully");
            match client.health_check().await {
                Ok(_) => {
                    log::info!("✅ R2 bucket is accessible");
                    Some(Arc::new(client))
                }
                Err(e) => {
                    log::warn!("⚠️  R2 health check failed: {}", e);
                    log::warn!("⚠️  Media uploads will be disabled until R2 is reachable.");
                    r2_error = Some(format!("R2 health check failed: {}", e));
                    None
                }
            }
        }
        Err(e) => {
            log::warn!("⚠️  R2 client not initialized: {}", e);
            log::warn!("⚠️  Media uploads will be disabled. Set R2 environment variables to enable uploads.");
            r2_error = Some(format!("R2 client not initialized: {}", e));
            None
        }
    };

    let app_state = AppState {
        db,
        sui_verification,
        r2_client,
        r2_error,
    };

    // Configure CORS for frontend integration
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let body_limit = RequestBodyLimitLayer::new(1024 * 1024 * 100); // 100 MB

    // Build application router - essential routes for Plaza + auth + posts
    let app = Router::new()
        // Health check
        .route("/health", get(health_check))

        // Plaza - Global feed
        .route("/api/plaza", get(get_plaza_posts))

        // User management (for authentication)
        .route("/api/users", post(create_user))
        .route("/api/verify/user-exists/:address", get(check_user_exists_by_address))
        .route("/api/users/by-address/:address", get(get_user_by_address))

        // Posts
        .route("/api/posts", post(create_post))
        .route("/api/posts/:id/like", post(like_post))

        // News feed
        .route("/api/users/:id/feed", get(get_news_feed))

        // Media uploads (R2)
        .route("/api/media/upload", post(upload_media))
        .route("/api/media/batch-upload", post(batch_upload_media))

        .layer(cors)
        .layer(body_limit)
        .with_state(app_state);

    // Start the server
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3001").await.unwrap();
    println!("🚀 MemeFlow Service running on http://0.0.0.0:3001");
    
    axum::serve(listener, app).await.unwrap();
}
