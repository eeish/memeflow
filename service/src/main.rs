use axum::{
    routing::{get, post},
    Router,
};
use tower_http::cors::{Any, CorsLayer};
use std::sync::Arc;

mod models;
mod handlers_simple;
mod database_sqlite;
mod sui_verification;

use database_sqlite as database;
use handlers_simple::*;

// Application state
#[derive(Clone)]
pub struct AppState {
    pub db: Arc<database::Database>,
    pub sui_verification: Arc<sui_verification::SuiVerification>,
}

#[tokio::main]
async fn main() {
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
    
    let app_state = AppState { db, sui_verification };

    // Configure CORS for frontend integration
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

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
        
        .layer(cors)
        .with_state(app_state);

    // Start the server
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3001").await.unwrap();
    println!("🚀 MemeFlow Service running on http://0.0.0.0:3001");
    
    axum::serve(listener, app).await.unwrap();
}
