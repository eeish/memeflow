use crate::models::*;
use chrono::Utc;
use sqlx::{Row, PgPool};
use uuid::Uuid;

type Result<T> = anyhow::Result<T>;

#[derive(Clone)]
pub struct Database {
    pool: PgPool,
}

impl Database {
    pub async fn new() -> Result<Self> {
        let database_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgres://cord:cord@localhost:5432/cord".to_string());

        Self::with_url(&database_url).await
    }

    pub async fn with_url(database_url: &str) -> Result<Self> {
        tracing::info!("Connecting to database: {}", database_url);

        let pool = PgPool::connect(database_url).await?;

        tracing::info!("Running database migrations");
        sqlx::migrate!("./migrations").run(&pool).await?;
        tracing::info!("Database migrations complete");

        Ok(Self { pool })
    }

    // -------------------------------------------------------------------------
    // User operations
    // -------------------------------------------------------------------------

    /// Check if a username already exists (case-insensitive)
    pub async fn username_exists(&self, username: &str) -> Result<bool> {
        let normalized = username.to_lowercase();
        let row = sqlx::query("SELECT COUNT(*) as count FROM users WHERE lower(username) = $1")
            .bind(&normalized)
            .fetch_one(&self.pool)
            .await?;

        let count: i64 = row.get("count");
        Ok(count > 0)
    }

    pub async fn create_user(&self, request: CreateUserRequest) -> Result<User> {
        let user_id = Uuid::new_v4();
        let now = Utc::now();
        let token_symbol = request.username.to_uppercase();

        sqlx::query(
            r#"
            INSERT INTO users (id, wallet_address, email, username, avatar_url, bio,
                             token_symbol, followers_count, following_count, posts_count, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0, 0, $8, $9)
            "#,
        )
        .bind(user_id.to_string())
        .bind(&request.wallet_address)
        .bind(&request.email)
        .bind(&request.username)
        .bind(&request.avatar_url)
        .bind(&request.bio)
        .bind(&token_symbol)
        .bind(now)
        .bind(now)
        .execute(&self.pool)
        .await?;

        Ok(User {
            id: user_id,
            wallet_address: request.wallet_address,
            email: request.email,
            username: request.username,
            avatar_url: request.avatar_url,
            bio: request.bio,
            token_symbol,
            followers_count: 0,
            following_count: 0,
            posts_count: 0,
            created_at: now,
            updated_at: now,
        })
    }

    pub async fn get_user_by_address(&self, wallet_address: &str) -> Result<Option<User>> {
        let row = sqlx::query(
            "SELECT id, wallet_address, email, username, avatar_url, bio, token_symbol, \
             followers_count, following_count, posts_count, created_at, updated_at \
             FROM users WHERE wallet_address = $1",
        )
        .bind(wallet_address)
        .fetch_optional(&self.pool)
        .await?;

        row.map(|r| {
            Ok(User {
                id: Uuid::parse_str(r.get("id"))?,
                wallet_address: r.get("wallet_address"),
                email: r.get("email"),
                username: r.get("username"),
                avatar_url: r.get("avatar_url"),
                bio: r.get("bio"),
                token_symbol: r.get("token_symbol"),
                followers_count: r.get("followers_count"),
                following_count: r.get("following_count"),
                posts_count: r.get("posts_count"),
                created_at: r.get("created_at"),
                updated_at: r.get("updated_at"),
            })
        })
        .transpose()
    }

    pub async fn user_exists_by_address(&self, wallet_address: &str) -> Result<bool> {
        let (count,): (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM users WHERE wallet_address = $1")
                .bind(wallet_address)
                .fetch_one(&self.pool)
                .await?;

        Ok(count > 0)
    }

    pub async fn get_user_by_id(&self, user_id: &str) -> Result<Option<User>> {
        let row = sqlx::query(
            "SELECT id, wallet_address, email, username, avatar_url, bio, token_symbol, \
             followers_count, following_count, posts_count, created_at, updated_at \
             FROM users WHERE id = $1",
        )
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await?;

        row.map(|r| {
            Ok(User {
                id: Uuid::parse_str(r.get("id"))?,
                wallet_address: r.get("wallet_address"),
                email: r.get("email"),
                username: r.get("username"),
                avatar_url: r.get("avatar_url"),
                bio: r.get("bio"),
                token_symbol: r.get("token_symbol"),
                followers_count: r.get("followers_count"),
                following_count: r.get("following_count"),
                posts_count: r.get("posts_count"),
                created_at: r.get("created_at"),
                updated_at: r.get("updated_at"),
            })
        })
        .transpose()
    }

    /// Check if a username exists, excluding a specific user ID (used on profile updates)
    pub async fn username_exists_excluding_user(
        &self,
        username: &str,
        exclude_user_id: &str,
    ) -> Result<bool> {
        let normalized = username.to_lowercase();
        let row = sqlx::query(
            "SELECT COUNT(*) as count FROM users WHERE lower(username) = $1 AND id != $2",
        )
        .bind(&normalized)
        .bind(exclude_user_id)
        .fetch_one(&self.pool)
        .await?;

        let count: i64 = row.get("count");
        Ok(count > 0)
    }

    /// Update user profile fields (username, bio, avatar_url).
    /// Keeps token_symbol in sync with username.
    pub async fn update_user_profile(
        &self,
        user_id: &str,
        username: Option<String>,
        bio: Option<String>,
        avatar_url: Option<String>,
    ) -> Result<User> {
        let now = Utc::now();

        // Build the SET clause with numbered parameters
        let mut param_idx: usize = 1;
        let mut sets: Vec<String> = Vec::new();

        sets.push(format!("updated_at = ${}", param_idx));
        param_idx += 1;

        if username.is_some() {
            sets.push(format!("username = ${}", param_idx));
            param_idx += 1;
            sets.push(format!("token_symbol = ${}", param_idx));
            param_idx += 1;
        }
        if bio.is_some() {
            sets.push(format!("bio = ${}", param_idx));
            param_idx += 1;
        }
        if avatar_url.is_some() {
            sets.push(format!("avatar_url = ${}", param_idx));
            param_idx += 1;
        }

        let query = format!("UPDATE users SET {} WHERE id = ${}", sets.join(", "), param_idx);

        let mut q = sqlx::query(&query);
        q = q.bind(now);
        if let Some(ref u) = username {
            q = q.bind(u);
            q = q.bind(u.to_uppercase());
        }
        if let Some(ref b) = bio {
            q = q.bind(b);
        }
        if let Some(ref a) = avatar_url {
            q = q.bind(a);
        }
        q = q.bind(user_id);
        q.execute(&self.pool).await?;

        let row = sqlx::query(
            "SELECT id, wallet_address, email, username, avatar_url, bio, token_symbol, \
             followers_count, following_count, posts_count, created_at, updated_at \
             FROM users WHERE id = $1",
        )
        .bind(user_id)
        .fetch_one(&self.pool)
        .await?;

        Ok(User {
            id: Uuid::parse_str(row.get("id"))?,
            wallet_address: row.get("wallet_address"),
            email: row.get("email"),
            username: row.get("username"),
            avatar_url: row.get("avatar_url"),
            bio: row.get("bio"),
            token_symbol: row.get("token_symbol"),
            followers_count: row.get("followers_count"),
            following_count: row.get("following_count"),
            posts_count: row.get("posts_count"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        })
    }

    // -------------------------------------------------------------------------
    // Post operations
    // -------------------------------------------------------------------------

    pub async fn create_post(
        &self,
        request: CreatePostRequest,
        content_hash: Option<String>,
        hash_timestamp_ms: Option<i64>,
    ) -> Result<Post> {
        let post_id = Uuid::new_v4();
        let author_id = Uuid::parse_str(&request.author_id)?;
        let now = Utc::now();

        let (content_blob_id, content_protocol_version) = if request.protocol_content.is_some() {
            (None, Some("1.0".to_string()))
        } else {
            (None, None)
        };

        let media_urls = request.media_urls.unwrap_or_default();
        let image_url = media_urls.first().cloned();

        sqlx::query(
            r#"
            INSERT INTO posts (id, user_id, content, image_url, content_blob_id, content_protocol_version,
                               content_hash, hash_timestamp_ms, likes_count, comments_count, retweets_count,
                               created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, 0, 0, $9, $10)
            "#,
        )
        .bind(post_id.to_string())
        .bind(&request.author_id)
        .bind(&request.content)
        .bind(&image_url)
        .bind(content_blob_id.as_ref())
        .bind(content_protocol_version.as_ref())
        .bind(content_hash.as_ref())
        .bind(hash_timestamp_ms)
        .bind(now)
        .bind(now)
        .execute(&self.pool)
        .await?;

        Ok(Post {
            id: post_id,
            author_id,
            content: request.content,
            media_urls,
            content_blob_id,
            content_protocol_version,
            content_hash,
            hash_timestamp_ms,
            likes_count: 0,
            comments_count: 0,
            reposts_count: 0,
            created_at: now,
            updated_at: now,
        })
    }

    pub async fn get_plaza_posts(
        &self,
        limit: Option<i32>,
        offset: Option<i32>,
    ) -> Result<Vec<PostWithAuthor>> {
        let limit = limit.unwrap_or(50);
        let offset = offset.unwrap_or(0);

        let rows = sqlx::query(
            r#"
            SELECT
                p.id as post_id, p.user_id, p.content, p.image_url,
                p.content_blob_id, p.content_protocol_version,
                p.content_hash, p.hash_timestamp_ms,
                p.likes_count, p.comments_count, p.retweets_count,
                p.created_at as post_created_at, p.updated_at as post_updated_at,
                u.username, u.avatar_url, u.bio, u.token_symbol,
                u.wallet_address, u.followers_count
            FROM posts p
            JOIN users u ON p.user_id = u.id
            ORDER BY p.created_at DESC
            LIMIT $1 OFFSET $2
            "#,
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter().map(|row| {
            let image_url: Option<String> = row.get("image_url");
            let media_urls = image_url.map(|u| vec![u]).unwrap_or_default();
            Ok(PostWithAuthor {
                post: Post {
                    id: Uuid::parse_str(row.get("post_id"))?,
                    author_id: Uuid::parse_str(row.get("user_id"))?,
                    content: row.get("content"),
                    media_urls,
                    content_blob_id: row.get("content_blob_id"),
                    content_protocol_version: row.get("content_protocol_version"),
                    content_hash: row.get("content_hash"),
                    hash_timestamp_ms: row.get("hash_timestamp_ms"),
                    likes_count: row.get("likes_count"),
                    comments_count: row.get("comments_count"),
                    reposts_count: row.get("retweets_count"),
                    created_at: row.get("post_created_at"),
                    updated_at: row.get("post_updated_at"),
                },
                author: UserProfile {
                    id: Uuid::parse_str(row.get("user_id"))?,
                    username: row.get("username"),
                    avatar_url: row.get("avatar_url"),
                    token_symbol: row.get("token_symbol"),
                    wallet_address: row.get("wallet_address"),
                    bio: row.get("bio"),
                    followers_count: row.get("followers_count"),
                },
            })
        }).collect()
    }

    pub async fn get_user_posts(
        &self,
        user_id: &str,
        limit: Option<i32>,
        offset: Option<i32>,
    ) -> Result<Vec<PostWithAuthor>> {
        let limit = limit.unwrap_or(50);
        let offset = offset.unwrap_or(0);

        let rows = sqlx::query(
            r#"
            SELECT
                p.id as post_id, p.user_id, p.content, p.image_url,
                p.content_blob_id, p.content_protocol_version,
                p.content_hash, p.hash_timestamp_ms,
                p.likes_count, p.comments_count, p.retweets_count,
                p.created_at as post_created_at, p.updated_at as post_updated_at,
                u.username, u.avatar_url, u.bio, u.token_symbol,
                u.wallet_address, u.followers_count
            FROM posts p
            JOIN users u ON p.user_id = u.id
            WHERE p.user_id = $1
            ORDER BY p.created_at DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(user_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter().map(|row| {
            let image_url: Option<String> = row.get("image_url");
            let media_urls = image_url.map(|u| vec![u]).unwrap_or_default();
            Ok(PostWithAuthor {
                post: Post {
                    id: Uuid::parse_str(row.get("post_id"))?,
                    author_id: Uuid::parse_str(row.get("user_id"))?,
                    content: row.get("content"),
                    media_urls,
                    content_blob_id: row.get("content_blob_id"),
                    content_protocol_version: row.get("content_protocol_version"),
                    content_hash: row.get("content_hash"),
                    hash_timestamp_ms: row.get("hash_timestamp_ms"),
                    likes_count: row.get("likes_count"),
                    comments_count: row.get("comments_count"),
                    reposts_count: row.get("retweets_count"),
                    created_at: row.get("post_created_at"),
                    updated_at: row.get("post_updated_at"),
                },
                author: UserProfile {
                    id: Uuid::parse_str(row.get("user_id"))?,
                    username: row.get("username"),
                    avatar_url: row.get("avatar_url"),
                    token_symbol: row.get("token_symbol"),
                    wallet_address: row.get("wallet_address"),
                    bio: row.get("bio"),
                    followers_count: row.get("followers_count"),
                },
            })
        }).collect()
    }

    /// Get a post by ID with author info
    pub async fn get_post_with_author(&self, post_id: &str) -> Result<Option<PostWithAuthor>> {
        let row = sqlx::query(
            r#"
            SELECT
                p.id as post_id, p.user_id, p.content, p.image_url,
                p.content_blob_id, p.content_protocol_version,
                p.content_hash, p.hash_timestamp_ms,
                p.likes_count, p.comments_count, p.retweets_count,
                p.created_at as post_created_at, p.updated_at as post_updated_at,
                u.username, u.avatar_url, u.bio, u.token_symbol,
                u.wallet_address, u.followers_count
            FROM posts p
            JOIN users u ON p.user_id = u.id
            WHERE p.id = $1
            "#,
        )
        .bind(post_id)
        .fetch_optional(&self.pool)
        .await?;

        row.map(|row| {
            let image_url: Option<String> = row.get("image_url");
            let media_urls = image_url.map(|u| vec![u]).unwrap_or_default();
            Ok(PostWithAuthor {
                post: Post {
                    id: Uuid::parse_str(row.get("post_id"))?,
                    author_id: Uuid::parse_str(row.get("user_id"))?,
                    content: row.get("content"),
                    media_urls,
                    content_blob_id: row.get("content_blob_id"),
                    content_protocol_version: row.get("content_protocol_version"),
                    content_hash: row.get("content_hash"),
                    hash_timestamp_ms: row.get("hash_timestamp_ms"),
                    likes_count: row.get("likes_count"),
                    comments_count: row.get("comments_count"),
                    reposts_count: row.get("retweets_count"),
                    created_at: row.get("post_created_at"),
                    updated_at: row.get("post_updated_at"),
                },
                author: UserProfile {
                    id: Uuid::parse_str(row.get("user_id"))?,
                    username: row.get("username"),
                    avatar_url: row.get("avatar_url"),
                    token_symbol: row.get("token_symbol"),
                    wallet_address: row.get("wallet_address"),
                    bio: row.get("bio"),
                    followers_count: row.get("followers_count"),
                },
            })
        })
        .transpose()
    }

    /// Get author's wallet address for a post
    pub async fn get_post_author_wallet(&self, post_id: &str) -> Result<Option<String>> {
        let row = sqlx::query(
            "SELECT u.wallet_address FROM posts p \
             JOIN users u ON p.user_id = u.id WHERE p.id = $1",
        )
        .bind(post_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|r| r.get("wallet_address")))
    }

    pub async fn get_post_author_id(&self, post_id: &str) -> Result<Option<String>> {
        let row = sqlx::query("SELECT user_id FROM posts WHERE id = $1")
            .bind(post_id)
            .fetch_optional(&self.pool)
            .await?;

        Ok(row.map(|r| r.get("user_id")))
    }

    pub async fn delete_post(&self, post_id: &str, user_id: &str) -> Result<bool> {
        let mut tx = self.pool.begin().await?;

        let row = sqlx::query("SELECT user_id FROM posts WHERE id = $1")
            .bind(post_id)
            .fetch_optional(&mut *tx)
            .await?;

        let Some(row) = row else {
            tx.rollback().await?;
            return Ok(false);
        };

        let owner_id: String = row.get("user_id");
        if owner_id != user_id {
            tx.rollback().await?;
            return Ok(false);
        }

        sqlx::query("DELETE FROM posts WHERE id = $1")
            .bind(post_id)
            .execute(&mut *tx)
            .await?;

        sqlx::query(
            "UPDATE users SET posts_count = GREATEST(posts_count - 1, 0) WHERE id = $1",
        )
        .bind(user_id)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(true)
    }

    // -------------------------------------------------------------------------
    // Like operations
    // -------------------------------------------------------------------------

    pub async fn like_post(&self, post_id: &str, user_id: &str) -> Result<bool> {
        let (existing,): (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM likes WHERE post_id = $1 AND user_id = $2")
                .bind(post_id)
                .bind(user_id)
                .fetch_one(&self.pool)
                .await?;

        if existing > 0 {
            sqlx::query("DELETE FROM likes WHERE post_id = $1 AND user_id = $2")
                .bind(post_id)
                .bind(user_id)
                .execute(&self.pool)
                .await?;

            sqlx::query("UPDATE posts SET likes_count = likes_count - 1 WHERE id = $1")
                .bind(post_id)
                .execute(&self.pool)
                .await?;

            Ok(false)
        } else {
            let like_id = Uuid::new_v4();
            sqlx::query(
                "INSERT INTO likes (id, post_id, user_id, created_at) VALUES ($1, $2, $3, $4)",
            )
            .bind(like_id.to_string())
            .bind(post_id)
            .bind(user_id)
            .bind(Utc::now())
            .execute(&self.pool)
            .await?;

            sqlx::query("UPDATE posts SET likes_count = likes_count + 1 WHERE id = $1")
                .bind(post_id)
                .execute(&self.pool)
                .await?;

            Ok(true)
        }
    }

    // -------------------------------------------------------------------------
    // Comment operations
    // -------------------------------------------------------------------------

    pub async fn create_comment(
        &self,
        post_id: &str,
        user_id: &str,
        content: &str,
        parent_comment_id: Option<&str>,
    ) -> Result<Comment> {
        let comment_id = Uuid::new_v4();
        let now = Utc::now();

        let mut tx = self.pool.begin().await?;

        sqlx::query(
            r#"
            INSERT INTO comments (id, post_id, user_id, content, parent_comment_id, likes_count, created_at)
            VALUES ($1, $2, $3, $4, $5, 0, $6)
            "#,
        )
        .bind(comment_id.to_string())
        .bind(post_id)
        .bind(user_id)
        .bind(content)
        .bind(parent_comment_id)
        .bind(now)
        .execute(&mut *tx)
        .await?;

        sqlx::query("UPDATE posts SET comments_count = comments_count + 1 WHERE id = $1")
            .bind(post_id)
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;

        Ok(Comment {
            id: comment_id,
            post_id: Uuid::parse_str(post_id)?,
            user_id: Uuid::parse_str(user_id)?,
            content: content.to_string(),
            parent_comment_id: parent_comment_id
                .map(Uuid::parse_str)
                .transpose()?,
            created_at: now,
        })
    }

    pub async fn get_comments_for_post(
        &self,
        post_id: &str,
        limit: Option<i32>,
        offset: Option<i32>,
    ) -> Result<Vec<CommentWithAuthor>> {
        let limit = limit.unwrap_or(50);
        let offset = offset.unwrap_or(0);

        let rows = sqlx::query(
            r#"
            SELECT
                c.id as comment_id, c.post_id, c.user_id, c.content,
                c.parent_comment_id, c.created_at as comment_created_at,
                u.username, u.avatar_url, u.token_symbol, u.wallet_address,
                u.bio, u.followers_count
            FROM comments c
            JOIN users u ON c.user_id = u.id
            WHERE c.post_id = $1
            ORDER BY c.created_at ASC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(post_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter().map(|row| {
            let user_id: String = row.get("user_id");
            let parent_comment_id: Option<String> = row.get("parent_comment_id");
            Ok(CommentWithAuthor {
                comment: Comment {
                    id: Uuid::parse_str(row.get("comment_id"))?,
                    post_id: Uuid::parse_str(post_id)?,
                    user_id: Uuid::parse_str(&user_id)?,
                    content: row.get("content"),
                    parent_comment_id: parent_comment_id
                        .as_deref()
                        .map(Uuid::parse_str)
                        .transpose()?,
                    created_at: row.get("comment_created_at"),
                },
                author: UserProfile {
                    id: Uuid::parse_str(&user_id)?,
                    username: row.get("username"),
                    avatar_url: row.get("avatar_url"),
                    token_symbol: row.get("token_symbol"),
                    wallet_address: row.get("wallet_address"),
                    bio: row.get("bio"),
                    followers_count: row.get("followers_count"),
                },
            })
        }).collect()
    }

    pub async fn get_comment_author_and_post(
        &self,
        comment_id: &str,
    ) -> Result<Option<(String, String)>> {
        let row = sqlx::query("SELECT user_id, post_id FROM comments WHERE id = $1")
            .bind(comment_id)
            .fetch_optional(&self.pool)
            .await?;

        Ok(row.map(|r| (r.get("user_id"), r.get("post_id"))))
    }

    // -------------------------------------------------------------------------
    // Notification operations
    // -------------------------------------------------------------------------

    pub async fn create_notification(
        &self,
        user_id: &str,
        content: &str,
        notification_type: &str,
        related_id: Option<&str>,
        detail: Option<&str>,
        actor_id: Option<&str>,
    ) -> Result<Notification> {
        let now = Utc::now();
        let notification_id = Uuid::new_v4().to_string();

        sqlx::query(
            r#"
            INSERT INTO notifications (id, user_id, title, content, notification_type,
                                       related_id, detail, actor_id, status, created_at)
            VALUES ($1, $2, 'Notification', $3, $4, $5, $6, $7, 'pending', $8)
            "#,
        )
        .bind(&notification_id)
        .bind(user_id)
        .bind(content)
        .bind(notification_type)
        .bind(related_id)
        .bind(detail)
        .bind(actor_id)
        .bind(now)
        .execute(&self.pool)
        .await?;

        Ok(Notification {
            id: notification_id,
            user_id: user_id.to_string(),
            content: content.to_string(),
            notification_type: notification_type.to_string(),
            status: "pending".to_string(),
            related_id: related_id.map(|s| s.to_string()),
            detail: detail.map(|s| s.to_string()),
            actor_id: actor_id.map(|s| s.to_string()),
            actor_username: None,
            actor_avatar_url: None,
            created_at: now,
        })
    }

    pub async fn fetch_pending_notifications(&self, limit: i64) -> Result<Vec<Notification>> {
        let rows = sqlx::query(
            r#"
            SELECT id, user_id, content, notification_type, status,
                   related_id, detail, actor_id, created_at
            FROM notifications
            WHERE status = 'pending'
            ORDER BY created_at ASC
            LIMIT $1
            "#,
        )
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter().map(|row| {
            Ok(Notification {
                id: row.get("id"),
                user_id: row.get("user_id"),
                content: row.get("content"),
                notification_type: row.get("notification_type"),
                status: row.get("status"),
                related_id: row.get("related_id"),
                detail: row.get("detail"),
                actor_id: row.get("actor_id"),
                actor_username: None,
                actor_avatar_url: None,
                created_at: row.get("created_at"),
            })
        }).collect()
    }

    pub async fn update_notification_status(&self, id: &str, status: &str) -> Result<()> {
        sqlx::query("UPDATE notifications SET status = $1 WHERE id = $2")
            .bind(status)
            .bind(id)
            .execute(&self.pool)
            .await?;

        Ok(())
    }

    pub async fn mark_all_notifications_read(&self, user_id: &str) -> Result<u64> {
        let result = sqlx::query(
            "UPDATE notifications SET status = 'read' WHERE user_id = $1 AND status != 'read'",
        )
        .bind(user_id)
        .execute(&self.pool)
        .await?;

        Ok(result.rows_affected())
    }

    pub async fn fetch_notifications_by_user(&self, user_id: &str) -> Result<Vec<Notification>> {
        let rows = sqlx::query(
            r#"
            SELECT n.id, n.user_id, n.content, n.notification_type, n.status,
                   n.related_id, n.detail, n.actor_id, n.created_at,
                   COALESCE(u.username, u2.username) as actor_username,
                   COALESCE(u.avatar_url, u2.avatar_url) as actor_avatar_url
            FROM notifications n
            LEFT JOIN users u ON n.actor_id = u.id
            LEFT JOIN users u2 ON n.actor_id IS NULL
                AND n.content LIKE '@% %'
                AND lower(u2.username) = lower(
                    SUBSTR(n.content, 2, STRPOS(SUBSTR(n.content, 2), ' ') - 1)
                )
            WHERE n.user_id = $1
            ORDER BY n.created_at DESC
            "#,
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter().map(|row| {
            Ok(Notification {
                id: row.get("id"),
                user_id: row.get("user_id"),
                content: row.get("content"),
                notification_type: row.get("notification_type"),
                status: row.get("status"),
                related_id: row.get("related_id"),
                detail: row.get("detail"),
                actor_id: row.get("actor_id"),
                actor_username: row.get("actor_username"),
                actor_avatar_url: row.get("actor_avatar_url"),
                created_at: row.get("created_at"),
            })
        }).collect()
    }

    // -------------------------------------------------------------------------
    // Follow operations
    // -------------------------------------------------------------------------

    pub async fn follow_user(&self, follower_id: &Uuid, following_id: &Uuid) -> Result<bool> {
        if follower_id == following_id {
            return Ok(false);
        }

        let (existing,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM follows WHERE follower_id = $1 AND following_id = $2",
        )
        .bind(follower_id.to_string())
        .bind(following_id.to_string())
        .fetch_one(&self.pool)
        .await?;

        if existing > 0 {
            return Ok(false);
        }

        let follow_id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO follows (id, follower_id, following_id, created_at) \
             VALUES ($1, $2, $3, $4)",
        )
        .bind(follow_id.to_string())
        .bind(follower_id.to_string())
        .bind(following_id.to_string())
        .bind(Utc::now())
        .execute(&self.pool)
        .await?;

        Ok(true)
    }

    pub async fn unfollow_user(&self, follower_id: &Uuid, following_id: &Uuid) -> Result<bool> {
        let (existing,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM follows WHERE follower_id = $1 AND following_id = $2",
        )
        .bind(follower_id.to_string())
        .bind(following_id.to_string())
        .fetch_one(&self.pool)
        .await?;

        if existing == 0 {
            return Ok(false);
        }

        sqlx::query("DELETE FROM follows WHERE follower_id = $1 AND following_id = $2")
            .bind(follower_id.to_string())
            .bind(following_id.to_string())
            .execute(&self.pool)
            .await?;

        Ok(true)
    }

    pub async fn is_following(&self, follower_id: &Uuid, following_id: &Uuid) -> bool {
        let result: std::result::Result<(i64,), sqlx::Error> = sqlx::query_as(
            "SELECT COUNT(*) FROM follows WHERE follower_id = $1 AND following_id = $2",
        )
        .bind(follower_id.to_string())
        .bind(following_id.to_string())
        .fetch_one(&self.pool)
        .await;

        result.map(|(count,)| count > 0).unwrap_or(false)
    }

    pub async fn get_follow_counts(&self, user_id: &Uuid) -> (i64, i64) {
        let result: std::result::Result<(i64, i64), sqlx::Error> =
            sqlx::query_as("SELECT followers_count, following_count FROM users WHERE id = $1")
                .bind(user_id.to_string())
                .fetch_one(&self.pool)
                .await;

        result.unwrap_or((0, 0))
    }

    // -------------------------------------------------------------------------
    // Graduation launch operations
    // -------------------------------------------------------------------------

    pub async fn get_graduation_launch_status(
        &self,
        owner_address: &str,
    ) -> Result<Option<GraduationLaunchStatus>> {
        let row = sqlx::query(
            r#"
            SELECT owner_address, market_id, token_name, token_symbol, status, step, error,
                   package_id, token_type, vault_id, pool_id, operator_address, created_at, updated_at
            FROM graduation_launches
            WHERE owner_address = $1
            "#,
        )
        .bind(owner_address)
        .fetch_optional(&self.pool)
        .await?;

        row.map(|row| {
            Ok(GraduationLaunchStatus {
                owner_address: row.get("owner_address"),
                market_id: row.get("market_id"),
                token_name: row.get("token_name"),
                token_symbol: row.get("token_symbol"),
                status: row.get("status"),
                step: row.get("step"),
                error: row.get("error"),
                package_id: row.get("package_id"),
                token_type: row.get("token_type"),
                vault_id: row.get("vault_id"),
                pool_id: row.get("pool_id"),
                operator_address: row.get("operator_address"),
                created_at: row.get("created_at"),
                updated_at: row.get("updated_at"),
            })
        })
        .transpose()
    }

    pub async fn upsert_graduation_launch_status(
        &self,
        status: UpsertGraduationLaunchStatus,
    ) -> Result<GraduationLaunchStatus> {
        let now = Utc::now();

        sqlx::query(
            r#"
            INSERT INTO graduation_launches (
                owner_address, market_id, token_name, token_symbol, status, step, error,
                package_id, token_type, vault_id, pool_id, operator_address, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            ON CONFLICT(owner_address) DO UPDATE SET
                market_id        = EXCLUDED.market_id,
                token_name       = EXCLUDED.token_name,
                token_symbol     = EXCLUDED.token_symbol,
                status           = EXCLUDED.status,
                step             = EXCLUDED.step,
                error            = EXCLUDED.error,
                package_id       = COALESCE(EXCLUDED.package_id, graduation_launches.package_id),
                token_type       = COALESCE(EXCLUDED.token_type, graduation_launches.token_type),
                vault_id         = COALESCE(EXCLUDED.vault_id, graduation_launches.vault_id),
                pool_id          = COALESCE(EXCLUDED.pool_id, graduation_launches.pool_id),
                operator_address = EXCLUDED.operator_address,
                updated_at       = EXCLUDED.updated_at
            "#,
        )
        .bind(&status.owner_address)
        .bind(&status.market_id)
        .bind(&status.token_name)
        .bind(&status.token_symbol)
        .bind(&status.status)
        .bind(&status.step)
        .bind(&status.error)
        .bind(&status.package_id)
        .bind(&status.token_type)
        .bind(&status.vault_id)
        .bind(&status.pool_id)
        .bind(&status.operator_address)
        .bind(now)
        .bind(now)
        .execute(&self.pool)
        .await?;

        self.get_graduation_launch_status(&status.owner_address)
            .await?
            .ok_or_else(|| anyhow::anyhow!("graduation launch upsert did not persist"))
    }

    // -------------------------------------------------------------------------
    // Swap events (AMM OHLCV)
    // -------------------------------------------------------------------------

    pub async fn record_swap_event(&self, req: &crate::models::RecordSwapRequest) -> Result<()> {
        let id = Uuid::new_v4().to_string();
        sqlx::query(
            r#"
            INSERT INTO swap_events (id, pool_id, trader, side, sui_amount_mist, token_amount,
                                     price_sui, timestamp_ms, tx_digest, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            "#,
        )
        .bind(&id)
        .bind(&req.pool_id)
        .bind(&req.trader)
        .bind(&req.side)
        .bind(req.sui_amount_mist)
        .bind(req.token_amount)
        .bind(req.price_sui)
        .bind(req.timestamp_ms)
        .bind(&req.tx_digest)
        .bind(Utc::now())
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Return OHLCV candles for `pool_id` bucketed by `interval_ms` milliseconds.
    /// Returns the most recent `limit` completed buckets, oldest first.
    pub async fn get_ohlcv(
        &self,
        pool_id: &str,
        interval_ms: i64,
        limit: i64,
    ) -> Result<Vec<crate::models::OhlcvCandle>> {
        use std::collections::BTreeMap;

        struct BucketAcc {
            open: f64,
            high: f64,
            low: f64,
            close: f64,
            volume_mist: i64,
            count: i64,
            first_ts: i64,
            last_ts: i64,
        }

        let raw = sqlx::query(
            "SELECT timestamp_ms, price_sui, sui_amount_mist \
             FROM swap_events WHERE pool_id = $1 ORDER BY timestamp_ms ASC",
        )
        .bind(pool_id)
        .fetch_all(&self.pool)
        .await?;

        let mut buckets: BTreeMap<i64, BucketAcc> = BTreeMap::new();
        for row in &raw {
            let ts: i64 = row.get("timestamp_ms");
            let price: f64 = row.get("price_sui");
            let vol: i64 = row.get("sui_amount_mist");
            let bucket = (ts / interval_ms) * interval_ms;
            let acc = buckets.entry(bucket).or_insert(BucketAcc {
                open: price,
                high: price,
                low: price,
                close: price,
                volume_mist: 0,
                count: 0,
                first_ts: ts,
                last_ts: ts,
            });
            if ts < acc.first_ts {
                acc.first_ts = ts;
                acc.open = price;
            }
            if ts > acc.last_ts {
                acc.last_ts = ts;
                acc.close = price;
            }
            if price > acc.high {
                acc.high = price;
            }
            if price < acc.low {
                acc.low = price;
            }
            acc.volume_mist += vol;
            acc.count += 1;
        }

        const MIST_PER_SUI: f64 = 1_000_000_000.0;
        let mut candles: Vec<crate::models::OhlcvCandle> = buckets
            .into_iter()
            .map(|(bucket_ms, acc)| crate::models::OhlcvCandle {
                time_ms: bucket_ms,
                open: acc.open,
                high: acc.high,
                low: acc.low,
                close: acc.close,
                volume_sui: acc.volume_mist as f64 / MIST_PER_SUI,
                trade_count: acc.count,
            })
            .collect();

        if candles.len() as i64 > limit {
            let skip = candles.len() - limit as usize;
            candles.drain(..skip);
        }

        Ok(candles)
    }
}
