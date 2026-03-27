use crate::{
    creator_token_builder::{self, BuildCreatorTokenRequest},
    graduation_operator::OperatorLaunchInput,
    models::*,
    profile_validation, username_validation, AppState,
};
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Multipart, Path, Query, State,
    },
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Json},
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use dashmap::DashMap;
use futures_util::{SinkExt, StreamExt};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashSet, VecDeque};
use std::{
    sync::Arc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::sync::{mpsc, Notify, Semaphore};
use uuid::Uuid;
#[derive(Deserialize)]
pub struct PlazaQuery {
    pub limit: Option<i32>,
    pub offset: Option<i32>,
}

// Health check endpoint
pub async fn health_check() -> Json<ApiResponse<String>> {
    Json(ApiResponse::success(
        "Cord Service is running! 🚀".to_string(),
    ))
}

const DEFAULT_BUILD_WINDOW_SECS: i64 = 600;
const DEFAULT_BUILD_MAX_CLOCK_SKEW_SECS: i64 = 300;
const DEFAULT_BUILD_NONCE_TTL_SECS: i64 = 1800;
const DEFAULT_BUILD_MAX_PER_IP: usize = 8;
const DEFAULT_BUILD_MAX_PER_OWNER: usize = 4;
const DEFAULT_BUILD_MAX_CONCURRENT: usize = 2;

static CREATOR_BUILD_IP_REQUESTS: Lazy<DashMap<String, VecDeque<i64>>> = Lazy::new(DashMap::new);
static CREATOR_BUILD_OWNER_REQUESTS: Lazy<DashMap<String, VecDeque<i64>>> = Lazy::new(DashMap::new);
static CREATOR_BUILD_USED_NONCES: Lazy<DashMap<String, i64>> = Lazy::new(DashMap::new);
static CREATOR_BUILD_SEMAPHORE: Lazy<Semaphore> = Lazy::new(|| {
    Semaphore::new(read_env_usize(
        "CREATOR_TOKEN_BUILD_MAX_CONCURRENT",
        DEFAULT_BUILD_MAX_CONCURRENT,
    ))
});

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn read_env_usize(key: &str, default: usize) -> usize {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse::<usize>().ok())
        .filter(|v| *v > 0)
        .unwrap_or(default)
}

fn read_env_i64(key: &str, default: i64) -> i64 {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse::<i64>().ok())
        .filter(|v| *v > 0)
        .unwrap_or(default)
}

fn extract_client_ip(headers: &HeaderMap) -> String {
    let forwarded = headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split(',').next())
        .map(str::trim)
        .filter(|v| !v.is_empty());
    if let Some(ip) = forwarded {
        return ip.to_string();
    }
    let real_ip = headers
        .get("x-real-ip")
        .and_then(|v| v.to_str().ok())
        .map(str::trim)
        .filter(|v| !v.is_empty());
    if let Some(ip) = real_ip {
        return ip.to_string();
    }
    "unknown".to_string()
}

fn normalize_object_id(value: &str) -> Option<String> {
    let trimmed = value.trim();
    let normalized = if trimmed.starts_with("0x") {
        trimmed.to_string()
    } else {
        format!("0x{}", trimmed)
    };

    if normalized.len() < 4 || normalized.len() > 66 {
        return None;
    }

    if normalized[2..].chars().all(|ch| ch.is_ascii_hexdigit()) {
        Some(normalized.to_lowercase())
    } else {
        None
    }
}

fn prune_window(entries: &mut VecDeque<i64>, cutoff_ms: i64) {
    while entries.front().is_some_and(|ts| *ts < cutoff_ms) {
        entries.pop_front();
    }
}

fn enforce_rate_limit(
    map: &DashMap<String, VecDeque<i64>>,
    key: &str,
    limit: usize,
    window_ms: i64,
    label: &str,
    now_ms: i64,
) -> Result<(), String> {
    let cutoff = now_ms - window_ms;
    let mut entry = map.entry(key.to_string()).or_insert_with(VecDeque::new);
    prune_window(&mut entry, cutoff);
    if entry.len() >= limit {
        return Err(format!("{label} rate limit exceeded"));
    }
    entry.push_back(now_ms);
    Ok(())
}

fn enforce_optional_build_api_key(headers: &HeaderMap) -> Result<(), String> {
    let expected = match std::env::var("CREATOR_TOKEN_BUILD_API_KEY") {
        Ok(value) if !value.trim().is_empty() => value,
        _ => return Ok(()),
    };

    let header_key = headers
        .get("x-creator-build-key")
        .and_then(|v| v.to_str().ok())
        .map(str::trim)
        .unwrap_or("");

    let bearer = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .map(str::trim)
        .and_then(|raw| raw.strip_prefix("Bearer "))
        .unwrap_or("");

    if header_key == expected || bearer == expected {
        Ok(())
    } else {
        Err("Missing or invalid creator build API key".to_string())
    }
}

fn enforce_build_request_security(
    owner_address: &str,
    auth_nonce: &str,
    auth_timestamp_ms: i64,
    headers: &HeaderMap,
) -> Result<(), String> {
    enforce_optional_build_api_key(headers)?;

    if !creator_token_builder::validate_auth_nonce(auth_nonce) {
        return Err("Invalid authorization nonce".to_string());
    }

    let now_ms = now_millis();
    let max_clock_skew_ms = read_env_i64(
        "CREATOR_TOKEN_BUILD_MAX_CLOCK_SKEW_SECS",
        DEFAULT_BUILD_MAX_CLOCK_SKEW_SECS,
    ) * 1000;
    if auth_timestamp_ms <= 0 || (now_ms - auth_timestamp_ms).abs() > max_clock_skew_ms {
        return Err("Authorization timestamp is outside the accepted window".to_string());
    }

    let nonce_ttl_ms = read_env_i64(
        "CREATOR_TOKEN_BUILD_NONCE_TTL_SECS",
        DEFAULT_BUILD_NONCE_TTL_SECS,
    ) * 1000;
    let nonce_key = format!("{owner_address}:{}", auth_nonce.trim());
    if let Some(expiry) = CREATOR_BUILD_USED_NONCES.get(&nonce_key) {
        if *expiry > now_ms {
            return Err("Authorization nonce has already been used".to_string());
        }
    }
    CREATOR_BUILD_USED_NONCES.insert(nonce_key, now_ms + nonce_ttl_ms);
    if CREATOR_BUILD_USED_NONCES.len() > 50_000 {
        CREATOR_BUILD_USED_NONCES.clear();
    }

    let window_ms =
        read_env_i64("CREATOR_TOKEN_BUILD_WINDOW_SECS", DEFAULT_BUILD_WINDOW_SECS) * 1000;
    let ip_limit = read_env_usize("CREATOR_TOKEN_BUILD_MAX_PER_IP", DEFAULT_BUILD_MAX_PER_IP);
    let owner_limit = read_env_usize(
        "CREATOR_TOKEN_BUILD_MAX_PER_OWNER",
        DEFAULT_BUILD_MAX_PER_OWNER,
    );
    let client_ip = extract_client_ip(headers);

    enforce_rate_limit(
        &CREATOR_BUILD_IP_REQUESTS,
        &client_ip,
        ip_limit,
        window_ms,
        "IP",
        now_ms,
    )?;
    enforce_rate_limit(
        &CREATOR_BUILD_OWNER_REQUESTS,
        owner_address,
        owner_limit,
        window_ms,
        "Owner",
        now_ms,
    )?;

    Ok(())
}

fn build_graduation_launch_auth_message(
    owner_address: &str,
    market_id: &str,
    token_name: &str,
    token_symbol: &str,
    network: &str,
    auth_timestamp_ms: i64,
    auth_nonce: &str,
) -> String {
    format!(
        "Cord Graduation Launch Authorization\n\nOwner: {owner_address}\nMarket ID: {market_id}\nToken Name: {token_name}\nToken Symbol: {token_symbol}\nNetwork: {network}\nTimestamp: {auth_timestamp_ms}\nNonce: {auth_nonce}\n\nSign this message to authorize Cord to publish the creator token, graduate the market, initialize the Phase 2 AMM pool, and seed the launch liquidity using the Cord operator wallet."
    )
}

pub async fn build_creator_token_package_handler(
    State(app_state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<BuildCreatorTokenRequest>,
) -> impl IntoResponse {
    let owner_address = match creator_token_builder::normalize_owner_address(&request.owner_address)
    {
        Some(value) => value,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::error("Invalid owner_address".to_string())),
            );
        }
    };
    let token_name = match creator_token_builder::normalize_token_name(&request.token_name) {
        Some(value) => value,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::error(
                    "Invalid token_name: use 1-32 ASCII characters [A-Za-z0-9 _-.]".to_string(),
                )),
            );
        }
    };
    let token_symbol = match creator_token_builder::normalize_token_symbol(&request.token_symbol) {
        Some(value) => value,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::error(
                    "Invalid token_symbol: use 1-10 uppercase alphanumeric characters".to_string(),
                )),
            );
        }
    };

    if let Err(error) = enforce_build_request_security(
        &owner_address,
        request.auth_nonce.trim(),
        request.auth_timestamp_ms,
        &headers,
    ) {
        let status = if error.contains("rate limit") {
            StatusCode::TOO_MANY_REQUESTS
        } else if error.contains("API key") {
            StatusCode::UNAUTHORIZED
        } else {
            StatusCode::FORBIDDEN
        };
        return (status, Json(ApiResponse::error(error)));
    }

    let expected_auth_message = creator_token_builder::build_creator_token_auth_message(
        &owner_address,
        &token_name,
        &token_symbol,
        request.auth_timestamp_ms,
        request.auth_nonce.trim(),
    );
    if let Err(error) = creator_token_builder::verify_creator_token_auth_signature(
        &owner_address,
        &expected_auth_message,
        &request.auth_signature,
    ) {
        tracing::warn!(
            owner_address,
            "Creator token build request signature rejected: {}",
            error
        );
        return (
            StatusCode::UNAUTHORIZED,
            Json(ApiResponse::error(
                "Invalid authorization signature for creator token build".to_string(),
            )),
        );
    }

    let owner_exists = app_state
        .db
        .get_user_by_address(&owner_address)
        .await
        .ok()
        .flatten()
        .is_some()
        || app_state
            .db
            .get_user_by_address(request.owner_address.trim())
            .await
            .ok()
            .flatten()
            .is_some();

    if !owner_exists {
        return (
            StatusCode::FORBIDDEN,
            Json(ApiResponse::error(
                "Owner address is not registered".to_string(),
            )),
        );
    }

    let _permit = match CREATOR_BUILD_SEMAPHORE.acquire().await {
        Ok(permit) => permit,
        Err(_) => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(ApiResponse::error(
                    "Creator token build service is temporarily unavailable".to_string(),
                )),
            );
        }
    };

    let secure_request = BuildCreatorTokenRequest {
        owner_address,
        token_name,
        token_symbol,
        auth_nonce: request.auth_nonce,
        auth_timestamp_ms: request.auth_timestamp_ms,
        auth_signature: request.auth_signature,
    };

    match creator_token_builder::build_creator_token_package(secure_request) {
        Ok(response) => (StatusCode::OK, Json(ApiResponse::success(response))),
        Err(error) => {
            tracing::error!("Failed to build creator token package: {}", error);
            (StatusCode::BAD_REQUEST, Json(ApiResponse::error(error)))
        }
    }
}

pub async fn get_graduation_launch_status(
    State(app_state): State<AppState>,
    Path(owner_address): Path<String>,
) -> impl IntoResponse {
    let normalized_owner =
        match creator_token_builder::normalize_owner_address(owner_address.trim()) {
            Some(value) => value,
            None => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(ApiResponse::<GraduationLaunchStatus>::error(
                        "Invalid owner_address".to_string(),
                    )),
                )
            }
        };

    match app_state
        .db
        .get_graduation_launch_status(&normalized_owner)
        .await
    {
        Ok(Some(status)) => (StatusCode::OK, Json(ApiResponse::success(status))),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<GraduationLaunchStatus>::error(
                "Graduation launch status not found".to_string(),
            )),
        ),
        Err(error) => {
            tracing::error!("Failed to get graduation launch status: {}", error);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::<GraduationLaunchStatus>::error(
                    "Failed to load graduation launch status".to_string(),
                )),
            )
        }
    }
}

pub async fn request_graduation_launch(
    State(app_state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<GraduationLaunchRequest>,
) -> impl IntoResponse {
    let operator = match &app_state.graduation_operator {
        Some(operator) => operator.clone(),
        None => {
            let detail = app_state
                .graduation_operator_error
                .clone()
                .unwrap_or_else(|| "Graduation operator is not configured".to_string());
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(ApiResponse::<GraduationLaunchStatus>::error(detail)),
            );
        }
    };

    let owner_address =
        match creator_token_builder::normalize_owner_address(&request.owner_address) {
            Some(value) => value,
            None => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(ApiResponse::<GraduationLaunchStatus>::error(
                        "Invalid owner_address".to_string(),
                    )),
                )
            }
        };
    let market_id = match normalize_object_id(&request.market_id) {
        Some(value) => value,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<GraduationLaunchStatus>::error(
                    "Invalid market_id".to_string(),
                )),
            )
        }
    };
    let token_name = match creator_token_builder::normalize_token_name(&request.token_name) {
        Some(value) => value,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<GraduationLaunchStatus>::error(
                    "Invalid token_name".to_string(),
                )),
            )
        }
    };
    let token_symbol = match creator_token_builder::normalize_token_symbol(&request.token_symbol) {
        Some(value) => value,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<GraduationLaunchStatus>::error(
                    "Invalid token_symbol".to_string(),
                )),
            )
        }
    };

    if let Err(error) = enforce_build_request_security(
        &owner_address,
        request.auth_nonce.trim(),
        request.auth_timestamp_ms,
        &headers,
    ) {
        let status = if error.contains("rate limit") {
            StatusCode::TOO_MANY_REQUESTS
        } else if error.contains("API key") {
            StatusCode::UNAUTHORIZED
        } else {
            StatusCode::FORBIDDEN
        };
        return (
            status,
            Json(ApiResponse::<GraduationLaunchStatus>::error(error)),
        );
    }

    let expected_auth_message = build_graduation_launch_auth_message(
        &owner_address,
        &market_id,
        &token_name,
        &token_symbol,
        &operator.network,
        request.auth_timestamp_ms,
        request.auth_nonce.trim(),
    );
    if let Err(error) = creator_token_builder::verify_creator_token_auth_signature(
        &owner_address,
        &expected_auth_message,
        &request.auth_signature,
    ) {
        tracing::warn!(
            owner_address,
            "Graduation launch signature rejected: {}",
            error
        );
        return (
            StatusCode::UNAUTHORIZED,
            Json(ApiResponse::<GraduationLaunchStatus>::error(
                "Invalid graduation authorization signature".to_string(),
            )),
        );
    }

    let owner_exists = app_state
        .db
        .get_user_by_address(&owner_address)
        .await
        .ok()
        .flatten()
        .is_some()
        || app_state
            .db
            .get_user_by_address(request.owner_address.trim())
            .await
            .ok()
            .flatten()
            .is_some();

    if !owner_exists {
        return (
            StatusCode::FORBIDDEN,
            Json(ApiResponse::<GraduationLaunchStatus>::error(
                "Owner address is not registered".to_string(),
            )),
        );
    }

    let existing = match app_state
        .db
        .get_graduation_launch_status(&owner_address)
        .await
    {
        Ok(status) => status,
        Err(error) => {
            tracing::error!("Failed to query graduation launch status: {}", error);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::<GraduationLaunchStatus>::error(
                    "Failed to query graduation launch state".to_string(),
                )),
            );
        }
    };

    if let Some(status) = existing.clone() {
        let completed_with_pool = status.status == "completed" && status.pool_id.is_some();
        if status.status == "queued" || status.status == "running" || completed_with_pool {
            return (StatusCode::OK, Json(ApiResponse::success(status)));
        }
    }

    let queued = match app_state
        .db
        .upsert_graduation_launch_status(UpsertGraduationLaunchStatus {
            owner_address: owner_address.clone(),
            market_id: market_id.clone(),
            token_name: token_name.clone(),
            token_symbol: token_symbol.clone(),
            status: "queued".to_string(),
            step: "queued".to_string(),
            error: None,
            package_id: existing.as_ref().and_then(|status| status.package_id.clone()),
            token_type: existing.as_ref().and_then(|status| status.token_type.clone()),
            vault_id: existing.as_ref().and_then(|status| status.vault_id.clone()),
            pool_id: existing.as_ref().and_then(|status| status.pool_id.clone()),
            operator_address: operator.operator_address.clone(),
        })
        .await
    {
        Ok(status) => status,
        Err(error) => {
            tracing::error!("Failed to persist queued graduation launch: {}", error);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::<GraduationLaunchStatus>::error(
                    "Failed to queue graduation launch".to_string(),
                )),
            );
        }
    };

    let app_state_clone = app_state.clone();
    tokio::spawn(async move {
        let existing_status = app_state_clone
            .db
            .get_graduation_launch_status(&owner_address)
            .await
            .ok()
            .flatten();

        let needs_build = existing_status
            .as_ref()
            .map(|status| status.package_id.is_none() || status.token_type.is_none())
            .unwrap_or(true);

        let build_response = if needs_build {
            let _ = app_state_clone
                .db
                .upsert_graduation_launch_status(UpsertGraduationLaunchStatus {
                    owner_address: owner_address.clone(),
                    market_id: market_id.clone(),
                    token_name: token_name.clone(),
                    token_symbol: token_symbol.clone(),
                    status: "running".to_string(),
                    step: "building_package".to_string(),
                    error: None,
                    package_id: existing_status.as_ref().and_then(|status| status.package_id.clone()),
                    token_type: existing_status.as_ref().and_then(|status| status.token_type.clone()),
                    vault_id: existing_status.as_ref().and_then(|status| status.vault_id.clone()),
                    pool_id: existing_status.as_ref().and_then(|status| status.pool_id.clone()),
                    operator_address: operator.operator_address.clone(),
                })
                .await;

            match creator_token_builder::build_creator_token_package(BuildCreatorTokenRequest {
                owner_address: owner_address.clone(),
                token_name: token_name.clone(),
                token_symbol: token_symbol.clone(),
                auth_nonce: request.auth_nonce.clone(),
                auth_timestamp_ms: request.auth_timestamp_ms,
                auth_signature: request.auth_signature.clone(),
            }) {
                Ok(build) => Some(build),
                Err(error) => {
                    let _ = app_state_clone
                        .db
                        .upsert_graduation_launch_status(UpsertGraduationLaunchStatus {
                            owner_address: owner_address.clone(),
                            market_id: market_id.clone(),
                            token_name: token_name.clone(),
                            token_symbol: token_symbol.clone(),
                            status: "failed".to_string(),
                            step: "building_package".to_string(),
                            error: Some(error.clone()),
                            package_id: existing_status.as_ref().and_then(|status| status.package_id.clone()),
                            token_type: existing_status.as_ref().and_then(|status| status.token_type.clone()),
                            vault_id: existing_status.as_ref().and_then(|status| status.vault_id.clone()),
                            pool_id: existing_status.as_ref().and_then(|status| status.pool_id.clone()),
                            operator_address: operator.operator_address.clone(),
                        })
                        .await;
                    return;
                }
            }
        } else {
            None
        };

        let _ = app_state_clone
            .db
            .upsert_graduation_launch_status(UpsertGraduationLaunchStatus {
                owner_address: owner_address.clone(),
                market_id: market_id.clone(),
                token_name: token_name.clone(),
                token_symbol: token_symbol.clone(),
                status: "running".to_string(),
                step: "initializing_amm".to_string(),
                error: None,
                package_id: existing_status.as_ref().and_then(|status| status.package_id.clone()),
                token_type: existing_status.as_ref().and_then(|status| status.token_type.clone()),
                vault_id: existing_status.as_ref().and_then(|status| status.vault_id.clone()),
                pool_id: existing_status.as_ref().and_then(|status| status.pool_id.clone()),
                operator_address: operator.operator_address.clone(),
            })
            .await;

        match operator
            .launch(OperatorLaunchInput {
                owner_address: owner_address.clone(),
                market_id: market_id.clone(),
                token_name: token_name.clone(),
                token_symbol: token_symbol.clone(),
                package_build: build_response,
                existing_package_id: existing_status.as_ref().and_then(|status| status.package_id.clone()),
                existing_token_type: existing_status.as_ref().and_then(|status| status.token_type.clone()),
                existing_vault_id: existing_status.as_ref().and_then(|status| status.vault_id.clone()),
                existing_pool_id: existing_status.as_ref().and_then(|status| status.pool_id.clone()),
            })
            .await
        {
            Ok(result) => {
                tracing::info!(
                    owner = %owner_address,
                    market = %market_id,
                    package_id = ?result.package_id,
                    pool_id = ?result.pool_id,
                    tx_count = result.tx_digests.len(),
                    "Graduation operator completed"
                );
                let _ = app_state_clone
                    .db
                    .upsert_graduation_launch_status(UpsertGraduationLaunchStatus {
                        owner_address,
                        market_id,
                        token_name,
                        token_symbol,
                        status: "completed".to_string(),
                        step: "completed".to_string(),
                        error: None,
                        package_id: result.package_id,
                        token_type: result.token_type,
                        vault_id: result.vault_id,
                        pool_id: result.pool_id,
                        operator_address: operator.operator_address.clone(),
                    })
                    .await;
            }
            Err(error) => {
                tracing::error!(
                    owner = %owner_address,
                    market = %market_id,
                    "Graduation operator failed: {}",
                    error
                );
                let _ = app_state_clone
                    .db
                    .upsert_graduation_launch_status(UpsertGraduationLaunchStatus {
                        owner_address,
                        market_id,
                        token_name,
                        token_symbol,
                        status: "failed".to_string(),
                        step: "initializing_amm".to_string(),
                        error: Some(error.to_string()),
                        package_id: existing_status.as_ref().and_then(|status| status.package_id.clone()),
                        token_type: existing_status.as_ref().and_then(|status| status.token_type.clone()),
                        vault_id: existing_status.as_ref().and_then(|status| status.vault_id.clone()),
                        pool_id: existing_status.as_ref().and_then(|status| status.pool_id.clone()),
                        operator_address: operator.operator_address.clone(),
                    })
                    .await;
            }
        }
    });

    (StatusCode::ACCEPTED, Json(ApiResponse::success(queued)))
}

// Notifications: create and deliver
pub async fn create_notification(
    State(app_state): State<AppState>,
    Json(request): Json<CreateNotificationRequest>,
) -> Json<ApiResponse<Notification>> {
    if request.content.trim().is_empty() {
        return Json(ApiResponse::error(
            "Notification content cannot be empty".to_string(),
        ));
    }

    match app_state
        .db
        .create_notification(
            &request.user_id,
            request.content.trim(),
            "general",
            None,
            None,
            None,
        )
        .await
    {
        Ok(notification) => {
            app_state.notification_notify.notify_one();
            Json(ApiResponse::success(notification))
        }
        Err(e) => {
            tracing::error!("Failed to create notification: {}", e);
            Json(ApiResponse::error(
                "Failed to create notification".to_string(),
            ))
        }
    }
}

pub async fn get_notifications_by_user(
    State(app_state): State<AppState>,
    Path(user_id): Path<String>,
) -> Json<ApiResponse<Vec<Notification>>> {
    if Uuid::parse_str(&user_id).is_err() {
        return Json(ApiResponse::error("Invalid user id".to_string()));
    }

    match app_state.db.fetch_notifications_by_user(&user_id).await {
        Ok(notifications) => Json(ApiResponse::success(notifications)),
        Err(e) => {
            tracing::error!("Failed to fetch notifications for user {}: {}", user_id, e);
            Json(ApiResponse::error(
                "Failed to fetch notifications".to_string(),
            ))
        }
    }
}

pub async fn mark_notification_read(
    State(app_state): State<AppState>,
    Path(notification_id): Path<String>,
) -> Json<ApiResponse<String>> {
    match app_state
        .db
        .update_notification_status(&notification_id, "read")
        .await
    {
        Ok(()) => Json(ApiResponse::success(
            "Notification marked as read".to_string(),
        )),
        Err(e) => {
            tracing::error!(
                "Failed to mark notification {} as read: {}",
                notification_id,
                e
            );
            Json(ApiResponse::error(
                "Failed to mark notification as read".to_string(),
            ))
        }
    }
}

pub async fn mark_all_notifications_read(
    State(app_state): State<AppState>,
    Path(user_id): Path<String>,
) -> Json<ApiResponse<String>> {
    if Uuid::parse_str(&user_id).is_err() {
        return Json(ApiResponse::error("Invalid user id".to_string()));
    }

    match app_state.db.mark_all_notifications_read(&user_id).await {
        Ok(count) => Json(ApiResponse::success(format!(
            "{} notifications marked as read",
            count
        ))),
        Err(e) => {
            tracing::error!(
                "Failed to mark all notifications read for user {}: {}",
                user_id,
                e
            );
            Json(ApiResponse::error(
                "Failed to mark notifications as read".to_string(),
            ))
        }
    }
}

pub async fn ws_notifications(
    Path(user_id): Path<String>,
    State(app_state): State<AppState>,
    ws: WebSocketUpgrade,
) -> Result<impl IntoResponse, StatusCode> {
    // Validate user_id is a valid UUID
    if Uuid::parse_str(&user_id).is_err() {
        return Err(StatusCode::BAD_REQUEST);
    }

    Ok(ws.on_upgrade(move |socket| handle_notification_socket(socket, app_state, user_id)))
}

async fn handle_notification_socket(socket: WebSocket, app_state: AppState, user_id: String) {
    let (mut ws_sender, mut ws_receiver) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();

    app_state.notification_sessions.insert(user_id.clone(), tx);

    let send_task = tokio::spawn(async move {
        while let Some(message) = rx.recv().await {
            if ws_sender.send(message).await.is_err() {
                break;
            }
        }
    });

    while let Some(Ok(msg)) = ws_receiver.next().await {
        if matches!(msg, Message::Close(_)) {
            break;
        }
    }

    app_state.notification_sessions.remove(&user_id);
    send_task.abort();
}

pub async fn notification_worker(
    db: Arc<crate::database::Database>,
    notify: Arc<Notify>,
    sessions: Arc<DashMap<String, mpsc::UnboundedSender<Message>>>,
) {
    loop {
        tokio::select! {
            _ = notify.notified() => {}
            _ = tokio::time::sleep(Duration::from_millis(500)) => {}
        }

        let pending = match db.fetch_pending_notifications(100).await {
            Ok(rows) => rows,
            Err(e) => {
                tracing::error!("Failed to fetch pending notifications: {}", e);
                continue;
            }
        };

        for notification in pending {
            if let Some(sender) = sessions.get(&notification.user_id) {
                let payload = serde_json::json!({
                    "id": notification.id,
                    "user_id": notification.user_id,
                    "content": notification.content,
                    "notification_type": notification.notification_type,
                    "created_at": notification.created_at,
                });

                if sender.send(Message::Text(payload.to_string())).is_ok() {
                    if let Err(e) = db
                        .update_notification_status(&notification.id, "sent")
                        .await
                    {
                        tracing::error!("Failed to mark notification sent: {}", e);
                    }
                } else {
                    sessions.remove(&notification.user_id);
                }
            }
        }
    }
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
    let response = client.post(url).json(&request).send().await.map_err(|e| {
        tracing::error!("zkLogin salt proxy request failed: {}", e);
        (
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({ "error": "Upstream request failed" })),
        )
    })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "<unreadable body>".to_string());
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

    let body = response.json::<serde_json::Value>().await.map_err(|e| {
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
    let response = client.post(url).json(&request).send().await.map_err(|e| {
        tracing::error!("zkLogin prover proxy request failed: {}", e);
        (
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({ "error": "Upstream request failed" })),
        )
    })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "<unreadable body>".to_string());
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

    let body = response.json::<serde_json::Value>().await.map_err(|e| {
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
    tracing::info!(
        "Getting plaza posts with limit={:?}, offset={:?}",
        params.limit,
        params.offset
    );

    match app_state
        .db
        .get_plaza_posts(params.limit, params.offset)
        .await
    {
        Ok(posts) => {
            tracing::info!("Retrieved {} posts for plaza", posts.len());
            Json(ApiResponse::success(posts))
        }
        Err(e) => {
            tracing::error!("Failed to get plaza posts: {}", e);
            Json(ApiResponse::error(
                "Failed to retrieve plaza posts".to_string(),
            ))
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
        Ok(exists) => Json(ApiResponse::success(exists)),
        Err(e) => {
            tracing::error!("Failed to check user existence: {}", e);
            Json(ApiResponse::error(
                "Failed to check user existence".to_string(),
            ))
        }
    }
}

pub async fn get_user_by_address(
    State(app_state): State<AppState>,
    Path(address): Path<String>,
) -> Json<ApiResponse<User>> {
    tracing::info!("Getting user by address: {}", address);

    match app_state.db.get_user_by_address(&address).await {
        Ok(Some(user)) => Json(ApiResponse::success(user)),
        Ok(None) => Json(ApiResponse::error("User not found".to_string())),
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
        Ok(Some(user)) => Json(ApiResponse::success(user)),
        Ok(None) => Json(ApiResponse::error("User not found".to_string())),
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
            Json(ApiResponse::error(
                "Failed to check username availability".to_string(),
            ))
        }
    }
}

pub async fn create_user(
    State(app_state): State<AppState>,
    Json(mut request): Json<CreateUserRequest>,
) -> Json<ApiResponse<User>> {
    tracing::info!(
        "Creating new user: wallet_address={:?}, username={}",
        request.wallet_address,
        request.username
    );

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
            return Json(ApiResponse::error(
                "This username is already taken".to_string(),
            ));
        }
        Ok(false) => {}
        Err(e) => {
            tracing::error!("Failed to check username: {}", e);
            return Json(ApiResponse::error(
                "Failed to validate username".to_string(),
            ));
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
                match app_state
                    .db
                    .username_exists_excluding_user(&normalized, &user_id)
                    .await
                {
                    Ok(true) => {
                        tracing::warn!("Username already taken: {}", normalized);
                        return Json(ApiResponse::error(
                            "This username is already taken".to_string(),
                        ));
                    }
                    Ok(false) => Some(normalized),
                    Err(e) => {
                        tracing::error!("Failed to check username availability: {}", e);
                        return Json(ApiResponse::error(
                            "Failed to validate username".to_string(),
                        ));
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
    match app_state
        .db
        .update_user_profile(
            &user_id,
            validated_username,
            validated_bio,
            validated_avatar,
        )
        .await
    {
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
    tracing::info!(
        "Getting news feed for user: {} with limit={:?}, offset={:?}",
        user_id,
        params.limit,
        params.offset
    );

    // For now, return the same as Plaza (all posts)
    // In the future, this could be personalized based on who the user follows
    match app_state
        .db
        .get_plaza_posts(params.limit, params.offset)
        .await
    {
        Ok(posts) => {
            tracing::info!("Retrieved {} posts for user feed", posts.len());
            Json(ApiResponse::success(posts))
        }
        Err(e) => {
            tracing::error!("Failed to get user feed: {}", e);
            Json(ApiResponse::error(
                "Failed to retrieve news feed".to_string(),
            ))
        }
    }
}

// Get posts by a specific user
pub async fn get_user_posts(
    State(app_state): State<AppState>,
    Path(user_id): Path<String>,
    Query(params): Query<PlazaQuery>,
) -> Json<ApiResponse<Vec<PostWithAuthor>>> {
    tracing::info!(
        "Getting posts for user {} with limit={:?}, offset={:?}",
        user_id,
        params.limit,
        params.offset
    );

    match app_state
        .db
        .get_user_posts(&user_id, params.limit, params.offset)
        .await
    {
        Ok(posts) => {
            tracing::info!("Retrieved {} posts for user {}", posts.len(), user_id);
            Json(ApiResponse::success(posts))
        }
        Err(e) => {
            tracing::error!("Failed to get user posts: {}", e);
            Json(ApiResponse::error(
                "Failed to retrieve user posts".to_string(),
            ))
        }
    }
}

// Create post endpoint
// Returns post with content_hash for on-chain attestation
pub async fn create_post(
    State(app_state): State<AppState>,
    Json(request): Json<CreatePostRequest>,
) -> Json<ApiResponse<CreatePostResponse>> {
    tracing::info!(
        "Creating new post: author_id={}, wallet={}, content_length={}",
        request.author_id,
        request.wallet_address,
        request.content.len()
    );

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

    tracing::info!(
        "Computed content hash: {} (timestamp_ms={})",
        content_hash,
        timestamp_ms
    );

    // Create post in database with hash
    match app_state
        .db
        .create_post(request, Some(content_hash.clone()), Some(timestamp_ms))
        .await
    {
        Ok(post) => {
            tracing::info!(
                "Post created successfully: id={}, hash={}",
                post.id,
                content_hash
            );

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
    tracing::info!(
        "Toggling like for post: {} by user: {}",
        post_id,
        request.user_id
    );

    match app_state.db.like_post(&post_id, &request.user_id).await {
        Ok(is_liked) => {
            tracing::info!(
                "Like toggled successfully: post={}, is_liked={}",
                post_id,
                is_liked
            );
            Json(ApiResponse::success(is_liked))
        }
        Err(e) => {
            tracing::error!("Failed to toggle like: {}", e);
            Json(ApiResponse::error("Failed to like post".to_string()))
        }
    }
}

#[derive(Deserialize)]
pub struct CommentQuery {
    pub limit: Option<i32>,
    pub offset: Option<i32>,
}

pub async fn get_post_comments(
    State(app_state): State<AppState>,
    Path(post_id): Path<String>,
    Query(params): Query<CommentQuery>,
) -> Json<ApiResponse<Vec<CommentWithAuthor>>> {
    tracing::info!("Fetching comments for post: {}", post_id);

    if Uuid::parse_str(&post_id).is_err() {
        return Json(ApiResponse::error("Invalid post id".to_string()));
    }

    match app_state
        .db
        .get_comments_for_post(&post_id, params.limit, params.offset)
        .await
    {
        Ok(comments) => Json(ApiResponse::success(comments)),
        Err(e) => {
            tracing::error!("Failed to fetch comments: {}", e);
            Json(ApiResponse::error("Failed to fetch comments".to_string()))
        }
    }
}

pub async fn create_comment(
    State(app_state): State<AppState>,
    Path(post_id): Path<String>,
    Json(request): Json<CreateCommentRequest>,
) -> Json<ApiResponse<CommentWithAuthor>> {
    if request.content.trim().is_empty() {
        return Json(ApiResponse::error("Comment cannot be empty".to_string()));
    }

    if Uuid::parse_str(&post_id).is_err() {
        return Json(ApiResponse::error("Invalid post id".to_string()));
    }

    let commenter_id = match Uuid::parse_str(&request.user_id) {
        Ok(id) => id,
        Err(_) => return Json(ApiResponse::error("Invalid user id".to_string())),
    };

    let parent_comment_id = match request.parent_comment_id.as_deref() {
        Some(parent) => match Uuid::parse_str(parent) {
            Ok(id) => Some(id),
            Err(_) => return Json(ApiResponse::error("Invalid parent comment id".to_string())),
        },
        None => None,
    };

    let reply_to_user_id = match request.reply_to_user_id.as_deref() {
        Some(target_user_id) => match Uuid::parse_str(target_user_id) {
            Ok(id) => Some(id),
            Err(_) => return Json(ApiResponse::error("Invalid reply_to_user_id".to_string())),
        },
        None => None,
    };

    if let Some(parent_id) = parent_comment_id {
        match app_state
            .db
            .get_comment_author_and_post(&parent_id.to_string())
            .await
        {
            Ok(Some((_author_id, parent_post_id))) => {
                if parent_post_id != post_id {
                    return Json(ApiResponse::error(
                        "Parent comment does not belong to this post".to_string(),
                    ));
                }
            }
            Ok(None) => return Json(ApiResponse::error("Parent comment not found".to_string())),
            Err(e) => {
                tracing::error!("Failed to validate parent comment: {}", e);
                return Json(ApiResponse::error("Failed to create comment".to_string()));
            }
        }
    }

    let user = match app_state.db.get_user_by_id(&request.user_id).await {
        Ok(Some(user)) => user,
        Ok(None) => return Json(ApiResponse::error("User not found".to_string())),
        Err(e) => {
            tracing::error!("Failed to get user: {}", e);
            return Json(ApiResponse::error("Failed to create comment".to_string()));
        }
    };

    let comment = match app_state
        .db
        .create_comment(
            &post_id,
            &request.user_id,
            request.content.trim(),
            request.parent_comment_id.as_deref(),
        )
        .await
    {
        Ok(comment) => comment,
        Err(e) => {
            tracing::error!("Failed to create comment: {}", e);
            return Json(ApiResponse::error("Failed to create comment".to_string()));
        }
    };

    // Collect recipients to avoid duplicate notifications.
    let mut recipients: HashSet<String> = HashSet::new();
    let mut reply_recipients: HashSet<String> = HashSet::new();

    if let Ok(Some(author_id)) = app_state.db.get_post_author_id(&post_id).await {
        if author_id != request.user_id {
            recipients.insert(author_id);
        }
    }

    if let Some(parent_id) = request.parent_comment_id.as_deref() {
        if let Ok(Some((parent_author_id, _parent_post_id))) =
            app_state.db.get_comment_author_and_post(parent_id).await
        {
            if parent_author_id != request.user_id {
                recipients.insert(parent_author_id.clone());
                reply_recipients.insert(parent_author_id);
            }
        }
    }

    if let Some(target_uuid) = reply_to_user_id {
        let target_id = target_uuid.to_string();
        if target_id != request.user_id {
            recipients.insert(target_id.clone());
            reply_recipients.insert(target_id);
        }
    }

    for recipient in &recipients {
        let (message, notification_type) = if reply_recipients.contains(recipient) {
            (
                format!("@{} replied to your comment", user.username),
                "reply",
            )
        } else {
            (
                format!("@{} commented on your post", user.username),
                "comment",
            )
        };
        if let Err(e) = app_state
            .db
            .create_notification(
                recipient,
                &message,
                notification_type,
                Some(&post_id),
                Some(request.content.trim()),
                Some(&request.user_id),
            )
            .await
        {
            tracing::error!("Failed to create notification: {}", e);
        } else {
            app_state.notification_notify.notify_one();
        }
    }

    let comment_with_author = CommentWithAuthor {
        comment,
        author: UserProfile {
            id: commenter_id,
            username: user.username,
            avatar_url: user.avatar_url,
            token_symbol: user.token_symbol,
            wallet_address: user.wallet_address,
            bio: user.bio,
            followers_count: Some(user.followers_count),
        },
    };

    Json(ApiResponse::success(comment_with_author))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{database::Database, sui_verification::SuiVerification, AppState};
    use dashmap::DashMap;
    use tokio::sync::Notify;

    async fn test_state() -> AppState {
        let db_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgres://cord:cord@localhost:5432/cord".to_string());
        let db = Database::with_url(&db_url).await.expect("db");
        AppState {
            db: std::sync::Arc::new(db),
            sui_verification: std::sync::Arc::new(SuiVerification::new()),
            r2_client: None,
            r2_error: None,
            graduation_operator: None,
            graduation_operator_error: None,
            notification_sessions: std::sync::Arc::new(DashMap::new()),
            notification_notify: std::sync::Arc::new(Notify::new()),
        }
    }

    async fn create_user(app_state: &AppState, username: &str) -> User {
        let request = CreateUserRequest {
            wallet_address: None,
            email: None,
            username: username.to_string(),
            bio: None,
            avatar_url: None,
        };
        app_state
            .db
            .create_user(request)
            .await
            .expect("create user")
    }

    async fn create_post_for_user(app_state: &AppState, user: &User, content: &str) -> Post {
        let request = CreatePostRequest {
            author_id: user.id.to_string(),
            wallet_address: "0x1".to_string(),
            content: content.to_string(),
            media_urls: None,
            protocol_content: None,
        };
        app_state
            .db
            .create_post(request, None, None)
            .await
            .expect("create post")
    }

    #[tokio::test]
    async fn comment_creates_notification_for_post_author() {
        let app_state = test_state().await;

        let author = create_user(&app_state, "author").await;
        let commenter = create_user(&app_state, "commenter").await;
        let post = create_post_for_user(&app_state, &author, "hello").await;

        let response = create_comment(
            State(app_state.clone()),
            Path(post.id.to_string()),
            Json(CreateCommentRequest {
                user_id: commenter.id.to_string(),
                content: "nice post".to_string(),
                parent_comment_id: None,
                reply_to_user_id: None,
            }),
        )
        .await;

        assert!(response.0.success);

        let notifications = app_state
            .db
            .fetch_notifications_by_user(&author.id.to_string())
            .await
            .expect("fetch notifications");
        assert!(!notifications.is_empty());
    }

    #[tokio::test]
    async fn reply_to_comment_notifies_parent_author() {
        let app_state = test_state().await;

        let author = create_user(&app_state, "author2").await;
        let commenter = create_user(&app_state, "commenter2").await;
        let post = create_post_for_user(&app_state, &author, "post").await;

        let parent = create_comment(
            State(app_state.clone()),
            Path(post.id.to_string()),
            Json(CreateCommentRequest {
                user_id: commenter.id.to_string(),
                content: "first".to_string(),
                parent_comment_id: None,
                reply_to_user_id: None,
            }),
        )
        .await;

        let parent_comment_id = parent
            .0
            .data
            .as_ref()
            .expect("parent comment")
            .comment
            .id
            .to_string();

        let response = create_comment(
            State(app_state.clone()),
            Path(post.id.to_string()),
            Json(CreateCommentRequest {
                user_id: author.id.to_string(),
                content: "reply".to_string(),
                parent_comment_id: Some(parent_comment_id),
                reply_to_user_id: None,
            }),
        )
        .await;

        assert!(response.0.success);

        let notifications = app_state
            .db
            .fetch_notifications_by_user(&commenter.id.to_string())
            .await
            .expect("fetch notifications");
        assert!(!notifications.is_empty());
    }

    #[tokio::test]
    async fn get_notifications_by_user_returns_comment_notifications() {
        let app_state = test_state().await;

        let author = create_user(&app_state, "author3").await;
        let commenter = create_user(&app_state, "commenter3").await;
        let post = create_post_for_user(&app_state, &author, "hello").await;

        let _ = create_comment(
            State(app_state.clone()),
            Path(post.id.to_string()),
            Json(CreateCommentRequest {
                user_id: commenter.id.to_string(),
                content: "nice post".to_string(),
                parent_comment_id: None,
                reply_to_user_id: None,
            }),
        )
        .await;

        let response =
            get_notifications_by_user(State(app_state.clone()), Path(author.id.to_string())).await;

        assert!(response.0.success);
        let notifications = response.0.data.expect("notifications payload");
        assert!(!notifications.is_empty());
    }

    #[tokio::test]
    async fn reply_to_reply_notifies_target_user_when_reply_to_user_id_is_set() {
        let app_state = test_state().await;

        let post_author = create_user(&app_state, "post_author").await;
        let top_comment_author = create_user(&app_state, "top_commenter").await;
        let reply_author = create_user(&app_state, "reply_author").await;
        let replier = create_user(&app_state, "replier").await;
        let post = create_post_for_user(&app_state, &post_author, "post").await;

        let top_level = create_comment(
            State(app_state.clone()),
            Path(post.id.to_string()),
            Json(CreateCommentRequest {
                user_id: top_comment_author.id.to_string(),
                content: "top-level".to_string(),
                parent_comment_id: None,
                reply_to_user_id: None,
            }),
        )
        .await;

        let top_level_comment_id = top_level
            .0
            .data
            .as_ref()
            .expect("top-level comment")
            .comment
            .id
            .to_string();

        let _reply = create_comment(
            State(app_state.clone()),
            Path(post.id.to_string()),
            Json(CreateCommentRequest {
                user_id: reply_author.id.to_string(),
                content: "first reply".to_string(),
                parent_comment_id: Some(top_level_comment_id.clone()),
                reply_to_user_id: Some(top_comment_author.id.to_string()),
            }),
        )
        .await;

        let response = create_comment(
            State(app_state.clone()),
            Path(post.id.to_string()),
            Json(CreateCommentRequest {
                user_id: replier.id.to_string(),
                content: "reply to reply".to_string(),
                parent_comment_id: Some(top_level_comment_id),
                reply_to_user_id: Some(reply_author.id.to_string()),
            }),
        )
        .await;

        assert!(response.0.success);

        let target_notifications = app_state
            .db
            .fetch_notifications_by_user(&reply_author.id.to_string())
            .await
            .expect("fetch reply author notifications");
        assert!(!target_notifications.is_empty());
    }
}

#[derive(Deserialize)]
pub struct DeletePostRequest {
    pub user_id: uuid::Uuid,
}

pub async fn delete_post(
    State(app_state): State<AppState>,
    Path(post_id): Path<String>,
    Json(request): Json<DeletePostRequest>,
) -> Json<ApiResponse<bool>> {
    tracing::info!(
        "Delete post request: post_id={}, user_id={}",
        post_id,
        request.user_id
    );

    match app_state
        .db
        .delete_post(&post_id, &request.user_id.to_string())
        .await
    {
        Ok(true) => {
            tracing::info!("Post deleted successfully: {}", post_id);
            Json(ApiResponse::success(true))
        }
        Ok(false) => {
            tracing::warn!("Delete denied or post not found: {}", post_id);
            Json(ApiResponse::error(
                "Post not found or not owned by user".to_string(),
            ))
        }
        Err(e) => {
            tracing::error!("Failed to delete post: {}", e);
            Json(ApiResponse::error("Failed to delete post".to_string()))
        }
    }
}

// Verify post hash endpoint
// Verifies that a given hash matches the stored post content
pub async fn verify_post_hash(
    State(app_state): State<AppState>,
    Json(request): Json<VerifyPostHashRequest>,
) -> Json<ApiResponse<VerifyPostHashResponse>> {
    tracing::info!(
        "Verifying post hash: post_id={}, hash={}",
        request.post_id,
        request.content_hash
    );

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
            tracing::warn!(
                "Author wallet address not found for post: {}",
                request.post_id
            );
            return Json(ApiResponse::error(
                "Author wallet address not found".to_string(),
            ));
        }
        Err(e) => {
            tracing::error!("Failed to get author wallet: {}", e);
            return Json(ApiResponse::error(
                "Failed to retrieve author wallet".to_string(),
            ));
        }
    };

    // Check if post has stored hash info
    let (stored_hash, timestamp_ms) = match (
        &post_with_author.post.content_hash,
        post_with_author.post.hash_timestamp_ms,
    ) {
        (Some(h), Some(t)) => (h.clone(), t),
        _ => {
            tracing::warn!("Post has no hash info: {}", request.post_id);
            return Json(ApiResponse::error(
                "Post has no hash info (created before hash feature)".to_string(),
            ));
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
            return Json(ApiResponse::error(format!(
                "Hash verification error: {}",
                e
            )));
        }
    };

    // Also check against stored hash for consistency
    let matches_stored = request.content_hash == stored_hash;

    if valid != matches_stored {
        tracing::warn!(
            "Hash verification inconsistency: computed={}, matches_stored={}",
            valid,
            matches_stored
        );
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

    match app_state
        .db
        .follow_user(&request.follower_id, &user_id)
        .await
    {
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

    match app_state
        .db
        .unfollow_user(&request.follower_id, &user_id)
        .await
    {
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
    let follower_id =
        uuid::Uuid::parse_str(follower_id_str).map_err(|_| StatusCode::BAD_REQUEST)?;

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
) -> Result<
    Json<ApiResponse<MediaUploadResponse>>,
    (StatusCode, Json<ApiResponse<MediaUploadResponse>>),
> {
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
            return Err(api_error(
                StatusCode::SERVICE_UNAVAILABLE,
                "R2 client not configured",
            ));
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
                content_type = field.content_type().map(|ct| ct.to_string());

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
        tracing::warn!(
            "File too large: {} bytes (max: {} bytes)",
            file_data.len(),
            max_size
        );
        return Err(api_error(StatusCode::PAYLOAD_TOO_LARGE, "File too large"));
    }

    tracing::info!(
        "Uploading file: user={}, size={} bytes, type={}",
        user_id,
        file_data.len(),
        content_type
    );

    // Upload to R2
    match r2_client
        .upload_file(file_data.clone(), &content_type, &user_id)
        .await
    {
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
) -> Result<
    Json<ApiResponse<Vec<MediaUploadResponse>>>,
    (StatusCode, Json<ApiResponse<Vec<MediaUploadResponse>>>),
> {
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
                tracing::warn!(
                    "File too large in batch: {} bytes (max: {} bytes)",
                    data.len(),
                    max_size
                );
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
        api_error(
            StatusCode::BAD_REQUEST,
            "No user_id in batch upload request",
        )
    })?;

    // Validate batch
    if files.is_empty() {
        tracing::warn!("No files found in batch upload request");
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "No files in upload request",
        ));
    }

    if files.len() > 9 {
        tracing::warn!("Too many files in batch: {} (max: 9)", files.len());
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "Too many files in upload",
        ));
    }

    let total_size: usize = files.iter().map(|(data, _)| data.len()).sum();
    if total_size > 100 * 1024 * 1024 {
        tracing::warn!("Batch too large: {} bytes (max: 100 MB)", total_size);
        return Err(api_error(StatusCode::PAYLOAD_TOO_LARGE, "Batch too large"));
    }

    tracing::info!(
        "Batch upload: {} files, total size: {} bytes, user: {}",
        files.len(),
        total_size,
        user_id
    );

    // Upload all files
    let mut results: Vec<MediaUploadResponse> = Vec::new();

    for (index, (data, content_type)) in files.into_iter().enumerate() {
        tracing::info!("Uploading file {}/{}", index + 1, results.len() + 1);

        match r2_client
            .upload_file(data.clone(), &content_type, &user_id)
            .await
        {
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

// ============================================================================
// AMM OHLCV endpoints
// ============================================================================

#[derive(Deserialize)]
pub struct OhlcvQuery {
    /// Interval name: 1m, 5m, 15m, 1h, 4h, 1d
    pub interval: Option<String>,
    pub limit: Option<i64>,
}

fn interval_to_ms(interval: &str) -> i64 {
    match interval.to_lowercase().as_str() {
        "1m"  => 60_000,
        "5m"  => 300_000,
        "15m" => 900_000,
        "1h"  => 3_600_000,
        "4h"  => 14_400_000,
        "1d"  => 86_400_000,
        _     => 300_000, // default 5m
    }
}

pub async fn record_swap_event(
    State(state): State<crate::AppState>,
    Path(pool_id): Path<String>,
    Json(mut req): Json<crate::models::RecordSwapRequest>,
) -> Result<Json<ApiResponse<String>>, (StatusCode, Json<ApiResponse<String>>)> {
    req.pool_id = pool_id;
    state.db.record_swap_event(&req).await.map_err(|e| {
        api_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string())
    })?;
    Ok(Json(ApiResponse::success("ok".to_string())))
}

pub async fn get_ohlcv(
    State(state): State<crate::AppState>,
    Path(pool_id): Path<String>,
    Query(params): Query<OhlcvQuery>,
) -> Result<Json<ApiResponse<Vec<crate::models::OhlcvCandle>>>, (StatusCode, Json<ApiResponse<Vec<crate::models::OhlcvCandle>>>)> {
    let interval_ms = interval_to_ms(params.interval.as_deref().unwrap_or("5m"));
    let limit = params.limit.unwrap_or(200).clamp(1, 1000);

    let candles = state.db.get_ohlcv(&pool_id, interval_ms, limit).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::error(e.to_string())),
        )
    })?;

    Ok(Json(ApiResponse::success(candles)))
}
