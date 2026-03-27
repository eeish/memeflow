use axum::extract::ws::Message;
use axum::{
    extract::DefaultBodyLimit,
    routing::{delete, get, post},
    Router,
};
use dashmap::DashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, Notify};
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

mod creator_token_builder;
mod database;
mod graduation_operator;
mod handlers;
mod models;
pub mod post_hash;
pub mod profile_validation;
mod r2_client;
mod sui_verification;
pub mod username_validation;

use handlers::*;
use graduation_operator::GraduationOperator;

// Application state
#[derive(Clone)]
pub struct AppState {
    pub db: Arc<database::Database>,
    pub sui_verification: Arc<sui_verification::SuiVerification>,
    pub r2_client: Option<Arc<r2_client::R2Client>>,
    pub r2_error: Option<String>,
    pub graduation_operator: Option<Arc<GraduationOperator>>,
    pub graduation_operator_error: Option<String>,
    pub notification_sessions: Arc<DashMap<String, mpsc::UnboundedSender<Message>>>,
    pub notification_notify: Arc<Notify>,
}

#[tokio::main]
async fn main() {
    // Load .env file if it exists (prefer service/.env when running from repo root)
    if dotenvy::from_filename("service/.env").is_err() {
        let _ = dotenvy::dotenv();
    }

    // Initialize tracing subscriber with env filter
    // Default to info level, but allow RUST_LOG to override
    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,tower_http=debug,cord_service=debug"));

    tracing_subscriber::registry()
        .with(env_filter)
        .with(
            tracing_subscriber::fmt::layer()
                .with_target(true)
                .with_thread_ids(false)
                .with_file(true)
                .with_line_number(true),
        )
        .init();

    // Initialize database
    let db = Arc::new(
        database::Database::new()
            .await
            .expect("Failed to initialize database"),
    );

    // Initialize Sui verification service
    let network_url = std::env::var("SUI_NETWORK_URL").ok();
    let sui_verification =
        match sui_verification::SuiVerification::with_client(network_url.as_deref()).await {
            Ok(service) => {
                tracing::info!("Sui verification service initialized with blockchain client");
                Arc::new(service)
            }
            Err(e) => {
                tracing::warn!("Failed to initialize Sui client, using offline mode: {}", e);
                Arc::new(sui_verification::SuiVerification::new())
            }
        };

    // Initialize R2 client (optional - if credentials are not set, uploads will be disabled)
    let mut r2_error: Option<String> = None;
    let r2_client = match r2_client::R2Client::from_env().await {
        Ok(client) => {
            tracing::info!("✅ R2 client initialized successfully");
            match client.health_check().await {
                Ok(_) => {
                    tracing::info!("✅ R2 bucket is accessible");
                    Some(Arc::new(client))
                }
                Err(e) => {
                    tracing::warn!("⚠️  R2 health check failed: {}", e);
                    tracing::warn!("⚠️  Media uploads will be disabled until R2 is reachable.");
                    r2_error = Some(format!("R2 health check failed: {}", e));
                    None
                }
            }
        }
        Err(e) => {
            tracing::warn!("⚠️  R2 client not initialized: {}", e);
            tracing::warn!("⚠️  Media uploads will be disabled. Set R2 environment variables to enable uploads.");
            r2_error = Some(format!("R2 client not initialized: {}", e));
            None
        }
    };

    let mut graduation_operator_error: Option<String> = None;
    let graduation_operator = match GraduationOperator::from_env() {
        Ok(operator) => {
            tracing::info!(
                operator = %operator.operator_address,
                network = %operator.network,
                "Graduation operator initialized"
            );
            Some(Arc::new(operator))
        }
        Err(error) => {
            tracing::warn!("Graduation operator not initialized: {}", error);
            graduation_operator_error = Some(error.to_string());
            None
        }
    };

    let app_state = AppState {
        db,
        sui_verification,
        r2_client,
        r2_error,
        graduation_operator,
        graduation_operator_error,
        notification_sessions: Arc::new(DashMap::new()),
        notification_notify: Arc::new(Notify::new()),
    };

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
        .route(
            "/api/users/check-username/:username",
            get(check_username_available),
        )
        .route(
            "/api/verify/user-exists/:address",
            get(check_user_exists_by_address),
        )
        .route("/api/users/by-address/:address", get(get_user_by_address))
        .route("/api/users/:id", get(get_user_by_id))
        .route("/api/users/:id/profile", post(update_user_profile))
        .route(
            "/api/creator-token/build",
            post(build_creator_token_package_handler),
        )
        .route("/api/graduation/launch", post(request_graduation_launch))
        .route(
            "/api/graduation/status/:owner_address",
            get(get_graduation_launch_status),
        )
        // Posts
        .route("/api/posts", post(create_post))
        .route("/api/posts/:id/like", post(like_post))
        .route("/api/posts/:id/comments", get(get_post_comments))
        .route("/api/posts/:id/comments", post(create_comment))
        .route("/api/posts/:id", delete(delete_post))
        .route("/api/posts/verify-hash", post(verify_post_hash))
        // News feed
        .route("/api/users/:id/feed", get(get_news_feed))
        // User posts
        .route("/api/users/:id/posts", get(get_user_posts))
        // Follow/Unfollow
        .route("/api/users/:id/follow", post(follow_user))
        .route("/api/users/:id/unfollow", post(unfollow_user))
        .route("/api/users/:id/follow-status", get(get_follow_status))
        // Notifications
        .route("/api/notifications", post(create_notification))
        .route(
            "/api/notifications/:user_id",
            get(get_notifications_by_user),
        )
        .route(
            "/api/notifications/:notification_id/mark-read",
            post(mark_notification_read),
        )
        .route(
            "/api/notifications/:user_id/mark-all-read",
            post(mark_all_notifications_read),
        )
        .route("/ws/notifications/:user_id", get(ws_notifications))
        // AMM OHLCV
        .route("/api/amm/:pool_id/swap", post(record_swap_event))
        .route("/api/amm/:pool_id/ohlcv", get(get_ohlcv))
        // Media uploads (R2)
        .route("/api/media/upload", post(upload_media))
        .route("/api/media/batch-upload", post(batch_upload_media))
        // zkLogin proxies (avoid browser CORS)
        .route("/api/zklogin/salt", post(zklogin_salt_proxy))
        .route("/api/zklogin/proof", post(zklogin_proof_proxy))
        .layer(cors)
        .layer(DefaultBodyLimit::max(1024 * 1024 * 100)) // 100 MB - compatible with Multipart
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(|request: &axum::http::Request<_>| {
                    tracing::info_span!(
                        "http_request",
                        method = %request.method(),
                        uri = %request.uri(),
                    )
                })
                .on_request(|request: &axum::http::Request<_>, _span: &tracing::Span| {
                    tracing::info!(
                        method = %request.method(),
                        uri = %request.uri(),
                        "→ request"
                    );
                })
                .on_response(
                    |response: &axum::http::Response<_>,
                     latency: std::time::Duration,
                     _span: &tracing::Span| {
                        tracing::info!(
                            status = %response.status(),
                            latency = ?latency,
                            "← response"
                        );
                    },
                )
                .on_failure(
                    |error: tower_http::classify::ServerErrorsFailureClass,
                     latency: std::time::Duration,
                     _span: &tracing::Span| {
                        tracing::error!(
                            error = %error,
                            latency = ?latency,
                            "✗ request failed"
                        );
                    },
                ),
        )
        .with_state(app_state.clone());

    tokio::spawn(notification_worker(
        app_state.db.clone(),
        app_state.notification_notify.clone(),
        app_state.notification_sessions.clone(),
    ));

    // Start the server
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3001").await.unwrap();
    println!("🚀 Cord Service running on http://0.0.0.0:3001");

    axum::serve(listener, app).await.unwrap();
}
