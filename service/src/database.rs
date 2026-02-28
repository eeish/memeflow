use crate::models::*;
use chrono::{NaiveDateTime, Utc};
use sqlx::{Row, SqlitePool};
use std::path::Path;
use uuid::Uuid;

type Result<T> = anyhow::Result<T>;

#[derive(Clone)]
pub struct Database {
    pool: SqlitePool,
}

impl Database {
    fn parse_db_timestamp(value: &str) -> Result<chrono::DateTime<Utc>> {
        if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(value) {
            return Ok(dt.with_timezone(&Utc));
        }

        if let Ok(naive) = NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S%.f") {
            return Ok(chrono::DateTime::<Utc>::from_naive_utc_and_offset(
                naive, Utc,
            ));
        }

        if let Ok(naive) = NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S") {
            return Ok(chrono::DateTime::<Utc>::from_naive_utc_and_offset(
                naive, Utc,
            ));
        }

        Err(anyhow::anyhow!("invalid timestamp format: {}", value))
    }

    pub async fn new() -> Result<Self> {
        // Use persistent file-based database
        let database_url =
            std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite:./db/cord.db".to_string());

        Self::with_url(&database_url).await
    }

    pub async fn with_url(database_url: &str) -> Result<Self> {
        println!("🗄️  Connecting to database: {}", database_url);

        // Create db directory if it doesn't exist (skip for in-memory)
        if !database_url.contains(":memory:") {
            let db_path = database_url.replace("sqlite:", "");
            if let Some(parent) = Path::new(&db_path).parent() {
                if !parent.exists() {
                    println!("📁 Creating database directory: {:?}", parent);
                    std::fs::create_dir_all(parent)?;
                }
            }
        }

        // Try to connect to database with proper error handling
        println!("📞 Attempting to connect to database...");
        let pool = match SqlitePool::connect(database_url).await {
            Ok(pool) => {
                println!("✅ Successfully connected to database");
                pool
            }
            Err(e) => {
                eprintln!("❌ Failed to connect to database: {}", e);
                eprintln!("Working directory: {:?}", std::env::current_dir());

                if !database_url.contains(":memory:") {
                    let db_path = database_url.replace("sqlite:", "");
                    eprintln!("Database path: {}", db_path);
                    // Try creating the file explicitly
                    if !Path::new(&db_path).exists() {
                        println!("📝 Creating database file: {}", db_path);
                        std::fs::File::create(&db_path)?;
                    }
                }

                // Retry connection
                println!("🔄 Retrying database connection...");
                SqlitePool::connect(database_url).await?
            }
        };

        let db = Self { pool };

        // Enable WAL mode for better concurrent read/write performance
        let _ = sqlx::query("PRAGMA journal_mode=WAL")
            .execute(&db.pool)
            .await;

        // Create tables
        db.create_tables().await?;

        // Database is ready for real user data (no sample data)

        Ok(db)
    }

    async fn create_tables(&self) -> Result<()> {
        // Users table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                wallet_address TEXT UNIQUE,
                email TEXT UNIQUE,
                username TEXT UNIQUE NOT NULL,
                avatar_url TEXT,
                bio TEXT,
                token_symbol TEXT NOT NULL,
                followers_count INTEGER NOT NULL DEFAULT 0,
                following_count INTEGER NOT NULL DEFAULT 0,
                posts_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Migration: drop legacy display_name column from users table (SQLite rebuild)
        let users_columns = sqlx::query("PRAGMA table_info(users)")
            .fetch_all(&self.pool)
            .await?;
        let has_display_name = users_columns
            .iter()
            .any(|row| row.get::<String, _>("name") == "display_name");

        if has_display_name {
            println!("🧹 Dropping legacy users.display_name column");

            sqlx::query("PRAGMA foreign_keys=OFF")
                .execute(&self.pool)
                .await?;

            sqlx::query("DROP TABLE IF EXISTS users_new")
                .execute(&self.pool)
                .await?;

            sqlx::query(
                r#"
                CREATE TABLE users_new (
                    id TEXT PRIMARY KEY,
                    wallet_address TEXT UNIQUE,
                    email TEXT UNIQUE,
                    username TEXT UNIQUE NOT NULL,
                    avatar_url TEXT,
                    bio TEXT,
                    token_symbol TEXT NOT NULL,
                    followers_count INTEGER NOT NULL DEFAULT 0,
                    following_count INTEGER NOT NULL DEFAULT 0,
                    posts_count INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                "#,
            )
            .execute(&self.pool)
            .await?;

            sqlx::query(
                r#"
                INSERT INTO users_new (
                    id, wallet_address, email, username, avatar_url, bio, token_symbol,
                    followers_count, following_count, posts_count, created_at, updated_at
                )
                SELECT
                    id, wallet_address, email, username, avatar_url, bio, token_symbol,
                    followers_count, following_count, posts_count, created_at, updated_at
                FROM users
                "#,
            )
            .execute(&self.pool)
            .await?;

            sqlx::query("DROP TABLE users").execute(&self.pool).await?;

            sqlx::query("ALTER TABLE users_new RENAME TO users")
                .execute(&self.pool)
                .await?;

            sqlx::query("PRAGMA foreign_keys=ON")
                .execute(&self.pool)
                .await?;
        }

        // Notifications table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS notifications (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                title TEXT NOT NULL DEFAULT 'Notification',
                content TEXT NOT NULL,
                notification_type TEXT NOT NULL DEFAULT 'general',
                related_id TEXT,
                is_read BOOLEAN NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL
            );
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Add notifications columns if missing (migration for existing DBs)
        let notification_columns = sqlx::query("PRAGMA table_info(notifications)")
            .fetch_all(&self.pool)
            .await?;

        let has_status = notification_columns
            .iter()
            .any(|row| row.get::<String, _>("name") == "status");
        if !has_status {
            sqlx::query(
                "ALTER TABLE notifications ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'",
            )
            .execute(&self.pool)
            .await?;
        }

        let has_created_at = notification_columns
            .iter()
            .any(|row| row.get::<String, _>("name") == "created_at");
        if !has_created_at {
            sqlx::query("ALTER TABLE notifications ADD COLUMN created_at TEXT NOT NULL DEFAULT (datetime('now'))")
                .execute(&self.pool)
                .await?;
        }

        let has_title = notification_columns
            .iter()
            .any(|row| row.get::<String, _>("name") == "title");
        if !has_title {
            sqlx::query(
                "ALTER TABLE notifications ADD COLUMN title TEXT NOT NULL DEFAULT 'Notification'",
            )
            .execute(&self.pool)
            .await?;
        }

        let has_notification_type = notification_columns
            .iter()
            .any(|row| row.get::<String, _>("name") == "notification_type");
        if !has_notification_type {
            sqlx::query("ALTER TABLE notifications ADD COLUMN notification_type TEXT NOT NULL DEFAULT 'general'")
                .execute(&self.pool)
                .await?;
        }

        let has_related_id = notification_columns
            .iter()
            .any(|row| row.get::<String, _>("name") == "related_id");
        if !has_related_id {
            let _ = sqlx::query("ALTER TABLE notifications ADD COLUMN related_id TEXT")
                .execute(&self.pool)
                .await;
        }

        let has_detail = notification_columns
            .iter()
            .any(|row| row.get::<String, _>("name") == "detail");
        if !has_detail {
            let _ = sqlx::query("ALTER TABLE notifications ADD COLUMN detail TEXT")
                .execute(&self.pool)
                .await;
        }

        let has_actor_id = notification_columns
            .iter()
            .any(|row| row.get::<String, _>("name") == "actor_id");
        if !has_actor_id {
            let _ = sqlx::query("ALTER TABLE notifications ADD COLUMN actor_id TEXT")
                .execute(&self.pool)
                .await;
        }

        let has_is_read = notification_columns
            .iter()
            .any(|row| row.get::<String, _>("name") == "is_read");
        if !has_is_read {
            sqlx::query("ALTER TABLE notifications ADD COLUMN is_read BOOLEAN NOT NULL DEFAULT 0")
                .execute(&self.pool)
                .await?;
        }

        // Backfill any legacy rows that might have NULL status after schema upgrades.
        sqlx::query(
            "UPDATE notifications SET status = 'pending' WHERE status IS NULL OR status = ''",
        )
        .execute(&self.pool)
        .await?;
        sqlx::query(
            "UPDATE notifications SET title = 'Notification' WHERE title IS NULL OR title = ''",
        )
        .execute(&self.pool)
        .await?;
        sqlx::query("UPDATE notifications SET notification_type = 'general' WHERE notification_type IS NULL OR notification_type = ''")
            .execute(&self.pool)
            .await?;

        // Posts table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS posts (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                content TEXT NOT NULL,
                image_url TEXT,
                content_hash TEXT,
                hash_timestamp_ms INTEGER,
                likes_count INTEGER NOT NULL DEFAULT 0,
                comments_count INTEGER NOT NULL DEFAULT 0,
                retweets_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            );
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Add content_hash columns if they don't exist (migration for existing DBs)
        let _ = sqlx::query("ALTER TABLE posts ADD COLUMN content_hash TEXT")
            .execute(&self.pool)
            .await;
        let _ = sqlx::query("ALTER TABLE posts ADD COLUMN hash_timestamp_ms INTEGER")
            .execute(&self.pool)
            .await;

        // Likes table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS likes (
                id TEXT PRIMARY KEY,
                post_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
                UNIQUE(post_id, user_id)
            );
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Comments table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS comments (
                id TEXT PRIMARY KEY,
                post_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                content TEXT NOT NULL,
                parent_comment_id TEXT,
                likes_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            );
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Add parent_comment_id column if missing (migration for existing DBs)
        let comment_columns = sqlx::query("PRAGMA table_info(comments)")
            .fetch_all(&self.pool)
            .await?;
        let has_parent_comment_id = comment_columns
            .iter()
            .any(|row| row.get::<String, _>("name") == "parent_comment_id");
        if !has_parent_comment_id {
            let _ = sqlx::query("ALTER TABLE comments ADD COLUMN parent_comment_id TEXT")
                .execute(&self.pool)
                .await;
        }

        // Follows table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS follows (
                id TEXT PRIMARY KEY,
                follower_id TEXT NOT NULL,
                following_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (follower_id) REFERENCES users (id) ON DELETE CASCADE,
                FOREIGN KEY (following_id) REFERENCES users (id) ON DELETE CASCADE,
                UNIQUE(follower_id, following_id)
            );
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Walrus integration: Add new columns to posts table if they don't exist
        // SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we check first
        let columns_exist =
            sqlx::query("SELECT content_blob_id, content_protocol_version FROM posts LIMIT 0")
                .fetch_optional(&self.pool)
                .await;

        if columns_exist.is_err() {
            println!("📦 Running Walrus integration migration: adding content_blob_id and content_protocol_version to posts table");

            sqlx::query("ALTER TABLE posts ADD COLUMN content_blob_id TEXT")
                .execute(&self.pool)
                .await?;

            sqlx::query("ALTER TABLE posts ADD COLUMN content_protocol_version TEXT DEFAULT '1.0'")
                .execute(&self.pool)
                .await?;

            println!("✅ Added Walrus columns to posts table");
        }

        // Create media_blobs table for tracking individual media items
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS media_blobs (
                id TEXT PRIMARY KEY,
                post_id TEXT NOT NULL,
                blob_id TEXT NOT NULL,
                content_type TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                checksum TEXT,
                metadata TEXT,
                upload_status TEXT DEFAULT 'uploaded',
                created_at TEXT NOT NULL,
                FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE
            );
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Create indexes for faster queries
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_media_blobs_post_id ON media_blobs(post_id)")
            .execute(&self.pool)
            .await?;

        sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_posts_content_blob_id ON posts(content_blob_id)",
        )
        .execute(&self.pool)
        .await?;

        println!("✅ Database tables created successfully");
        Ok(())
    }

    // User operations

    /// Check if a username already exists (case-insensitive)
    pub async fn username_exists(&self, username: &str) -> Result<bool> {
        let normalized = username.to_lowercase();
        let row = sqlx::query("SELECT COUNT(*) as count FROM users WHERE LOWER(username) = ?")
            .bind(&normalized)
            .fetch_one(&self.pool)
            .await?;

        let count: i64 = row.get("count");
        Ok(count > 0)
    }

    pub async fn create_user(&self, request: CreateUserRequest) -> Result<User> {
        let user_id = Uuid::new_v4();
        let now = Utc::now().to_rfc3339();
        let token_symbol = request.username.to_uppercase();

        sqlx::query(
            r#"
            INSERT INTO users (id, wallet_address, email, username, avatar_url, bio, 
                             token_symbol, followers_count, following_count, posts_count, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?)
            "#,
        )
        .bind(user_id.to_string())
        .bind(&request.wallet_address)
        .bind(&request.email)
        .bind(&request.username)
        .bind(&request.avatar_url)
        .bind(&request.bio)
        .bind(&token_symbol)
        .bind(&now)
        .bind(&now)
        .execute(&self.pool)
        .await?;

        let user = User {
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
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        Ok(user)
    }

    pub async fn get_user_by_address(&self, wallet_address: &str) -> Result<Option<User>> {
        let row = sqlx::query(
            "SELECT id, wallet_address, email, username, avatar_url, bio, token_symbol, followers_count, following_count, posts_count, created_at, updated_at FROM users WHERE wallet_address = ?"
        )
        .bind(wallet_address)
        .fetch_optional(&self.pool)
        .await?;

        if let Some(row) = row {
            Ok(Some(User {
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
                created_at: chrono::DateTime::parse_from_rfc3339(row.get("created_at"))?
                    .with_timezone(&Utc),
                updated_at: chrono::DateTime::parse_from_rfc3339(row.get("updated_at"))?
                    .with_timezone(&Utc),
            }))
        } else {
            Ok(None)
        }
    }

    pub async fn user_exists_by_address(&self, wallet_address: &str) -> Result<bool> {
        let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users WHERE wallet_address = ?")
            .bind(wallet_address)
            .fetch_one(&self.pool)
            .await?;

        Ok(count.0 > 0)
    }

    pub async fn get_user_by_id(&self, user_id: &str) -> Result<Option<User>> {
        let row = sqlx::query(
            "SELECT id, wallet_address, email, username, avatar_url, bio, token_symbol, followers_count, following_count, posts_count, created_at, updated_at FROM users WHERE id = ?"
        )
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await?;

        if let Some(row) = row {
            Ok(Some(User {
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
                created_at: chrono::DateTime::parse_from_rfc3339(row.get("created_at"))?
                    .with_timezone(&Utc),
                updated_at: chrono::DateTime::parse_from_rfc3339(row.get("updated_at"))?
                    .with_timezone(&Utc),
            }))
        } else {
            Ok(None)
        }
    }

    // Post operations
    pub async fn create_post(
        &self,
        request: CreatePostRequest,
        content_hash: Option<String>,
        hash_timestamp_ms: Option<i64>,
    ) -> Result<Post> {
        let post_id = Uuid::new_v4();
        let author_id = Uuid::parse_str(&request.author_id)?;
        let now = Utc::now().to_rfc3339();

        // Extract protocol fields if present
        let (content_blob_id, content_protocol_version) = if request.protocol_content.is_some() {
            (None, Some("1.0".to_string())) // Will be set by handler after uploading to Walrus
        } else {
            (None, None)
        };

        // Store first media URL in image_url field (database only supports single image)
        let media_urls = request.media_urls.unwrap_or_default();
        let image_url = media_urls.first().cloned();

        sqlx::query(
            r#"
            INSERT INTO posts (id, user_id, content, image_url, content_blob_id, content_protocol_version, content_hash, hash_timestamp_ms, likes_count, comments_count, retweets_count, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?)
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
        .bind(&now)
        .bind(&now)
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
            created_at: Utc::now(),
            updated_at: Utc::now(),
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
            LIMIT ? OFFSET ?
            "#,
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await?;

        let mut posts = Vec::new();
        for row in rows {
            let post_id: String = row.get("post_id");
            let user_id: String = row.get("user_id");
            let created_at: String = row.get("post_created_at");
            let updated_at: String = row.get("post_updated_at");

            // Convert image_url to media_urls array
            let image_url: Option<String> = row.get("image_url");
            let media_urls = image_url.map(|url| vec![url]).unwrap_or_default();

            let post = PostWithAuthor {
                post: Post {
                    id: Uuid::parse_str(&post_id)?,
                    author_id: Uuid::parse_str(&user_id)?,
                    content: row.get("content"),
                    media_urls,
                    content_blob_id: row.get("content_blob_id"),
                    content_protocol_version: row.get("content_protocol_version"),
                    content_hash: row.get("content_hash"),
                    hash_timestamp_ms: row.get("hash_timestamp_ms"),
                    likes_count: row.get("likes_count"),
                    comments_count: row.get("comments_count"),
                    reposts_count: row.get("retweets_count"),
                    created_at: chrono::DateTime::parse_from_rfc3339(&created_at)?
                        .with_timezone(&Utc),
                    updated_at: chrono::DateTime::parse_from_rfc3339(&updated_at)?
                        .with_timezone(&Utc),
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
            };
            posts.push(post);
        }

        Ok(posts)
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
            WHERE p.user_id = ?
            ORDER BY p.created_at DESC
            LIMIT ? OFFSET ?
            "#,
        )
        .bind(user_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await?;

        let mut posts = Vec::new();
        for row in rows {
            let post_id: String = row.get("post_id");
            let uid: String = row.get("user_id");
            let created_at: String = row.get("post_created_at");
            let updated_at: String = row.get("post_updated_at");

            // Convert image_url to media_urls array
            let image_url: Option<String> = row.get("image_url");
            let media_urls = image_url.map(|url| vec![url]).unwrap_or_default();

            let post = PostWithAuthor {
                post: Post {
                    id: Uuid::parse_str(&post_id)?,
                    author_id: Uuid::parse_str(&uid)?,
                    content: row.get("content"),
                    media_urls,
                    content_blob_id: row.get("content_blob_id"),
                    content_protocol_version: row.get("content_protocol_version"),
                    content_hash: row.get("content_hash"),
                    hash_timestamp_ms: row.get("hash_timestamp_ms"),
                    likes_count: row.get("likes_count"),
                    comments_count: row.get("comments_count"),
                    reposts_count: row.get("retweets_count"),
                    created_at: chrono::DateTime::parse_from_rfc3339(&created_at)?
                        .with_timezone(&Utc),
                    updated_at: chrono::DateTime::parse_from_rfc3339(&updated_at)?
                        .with_timezone(&Utc),
                },
                author: UserProfile {
                    id: Uuid::parse_str(&uid)?,
                    username: row.get("username"),
                    avatar_url: row.get("avatar_url"),
                    token_symbol: row.get("token_symbol"),
                    wallet_address: row.get("wallet_address"),
                    bio: row.get("bio"),
                    followers_count: row.get("followers_count"),
                },
            };
            posts.push(post);
        }

        Ok(posts)
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
            WHERE p.id = ?
            "#,
        )
        .bind(post_id)
        .fetch_optional(&self.pool)
        .await?;

        if let Some(row) = row {
            let pid: String = row.get("post_id");
            let user_id: String = row.get("user_id");
            let created_at: String = row.get("post_created_at");
            let updated_at: String = row.get("post_updated_at");

            let image_url: Option<String> = row.get("image_url");
            let media_urls = image_url.map(|url| vec![url]).unwrap_or_default();

            Ok(Some(PostWithAuthor {
                post: Post {
                    id: Uuid::parse_str(&pid)?,
                    author_id: Uuid::parse_str(&user_id)?,
                    content: row.get("content"),
                    media_urls,
                    content_blob_id: row.get("content_blob_id"),
                    content_protocol_version: row.get("content_protocol_version"),
                    content_hash: row.get("content_hash"),
                    hash_timestamp_ms: row.get("hash_timestamp_ms"),
                    likes_count: row.get("likes_count"),
                    comments_count: row.get("comments_count"),
                    reposts_count: row.get("retweets_count"),
                    created_at: chrono::DateTime::parse_from_rfc3339(&created_at)?
                        .with_timezone(&Utc),
                    updated_at: chrono::DateTime::parse_from_rfc3339(&updated_at)?
                        .with_timezone(&Utc),
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
            }))
        } else {
            Ok(None)
        }
    }

    /// Get author's wallet address for a post
    pub async fn get_post_author_wallet(&self, post_id: &str) -> Result<Option<String>> {
        let row = sqlx::query(
            r#"
            SELECT u.wallet_address
            FROM posts p
            JOIN users u ON p.user_id = u.id
            WHERE p.id = ?
            "#,
        )
        .bind(post_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|r| r.get("wallet_address")))
    }

    /// Check if a username exists, excluding a specific user ID
    /// Used for profile updates to allow users to keep their current username
    pub async fn username_exists_excluding_user(
        &self,
        username: &str,
        exclude_user_id: &str,
    ) -> Result<bool> {
        let normalized = username.to_lowercase();
        let row = sqlx::query(
            "SELECT COUNT(*) as count FROM users WHERE LOWER(username) = ? AND id != ?",
        )
        .bind(&normalized)
        .bind(exclude_user_id)
        .fetch_one(&self.pool)
        .await?;

        let count: i64 = row.get("count");
        Ok(count > 0)
    }

    /// Update user profile fields
    /// Updates username, bio, avatar_url, and keeps token_symbol in sync with username
    pub async fn update_user_profile(
        &self,
        user_id: &str,
        username: Option<String>,
        bio: Option<String>,
        avatar_url: Option<String>,
    ) -> Result<User> {
        let now = Utc::now().to_rfc3339();

        // Build dynamic update query based on which fields are provided
        let mut updates = vec!["updated_at = ?".to_string()];

        if username.is_some() {
            updates.push("username = ?".to_string());
            updates.push("token_symbol = ?".to_string()); // Keep in sync
        }
        if bio.is_some() {
            updates.push("bio = ?".to_string());
        }
        if avatar_url.is_some() {
            updates.push("avatar_url = ?".to_string());
        }

        let query = format!("UPDATE users SET {} WHERE id = ?", updates.join(", "));

        // Build query with bindings
        let mut query_builder = sqlx::query(&query);
        query_builder = query_builder.bind(&now);

        if let Some(ref u) = username {
            query_builder = query_builder.bind(u);
            query_builder = query_builder.bind(u.to_uppercase()); // token_symbol
        }
        if let Some(ref b) = bio {
            query_builder = query_builder.bind(b);
        }
        if let Some(ref a) = avatar_url {
            query_builder = query_builder.bind(a);
        }
        query_builder = query_builder.bind(user_id);

        query_builder.execute(&self.pool).await?;

        // Fetch and return the updated user
        let row = sqlx::query(
            "SELECT id, wallet_address, email, username, avatar_url, bio, token_symbol, followers_count, following_count, posts_count, created_at, updated_at FROM users WHERE id = ?"
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
            created_at: chrono::DateTime::parse_from_rfc3339(row.get("created_at"))?
                .with_timezone(&Utc),
            updated_at: chrono::DateTime::parse_from_rfc3339(row.get("updated_at"))?
                .with_timezone(&Utc),
        })
    }

    // Notification operations
    pub async fn create_notification(
        &self,
        user_id: &str,
        content: &str,
        notification_type: &str,
        related_id: Option<&str>,
        detail: Option<&str>,
        actor_id: Option<&str>,
    ) -> Result<Notification> {
        let now = Utc::now().to_rfc3339();
        let notification_id = Uuid::new_v4().to_string();

        sqlx::query(
            r#"
            INSERT INTO notifications (id, user_id, title, content, notification_type, related_id, detail, actor_id, status, is_read, created_at)
            VALUES (?, ?, 'Notification', ?, ?, ?, ?, ?, 'pending', 0, ?)
            "#,
        )
        .bind(&notification_id)
        .bind(user_id)
        .bind(content)
        .bind(notification_type)
        .bind(related_id)
        .bind(detail)
        .bind(actor_id)
        .bind(&now)
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
            created_at: chrono::DateTime::parse_from_rfc3339(&now)?.with_timezone(&Utc),
        })
    }

    pub async fn fetch_pending_notifications(&self, limit: i64) -> Result<Vec<Notification>> {
        let rows = sqlx::query(
            r#"
            SELECT id, user_id, content, notification_type, status, related_id, detail, actor_id, created_at
            FROM notifications
            WHERE status = 'pending'
            ORDER BY created_at ASC
            LIMIT ?
            "#,
        )
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        let mut notifications = Vec::new();
        for row in rows {
            let created_at: String = row.get("created_at");
            notifications.push(Notification {
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
                created_at: Self::parse_db_timestamp(&created_at)?,
            });
        }

        Ok(notifications)
    }

    pub async fn update_notification_status(&self, id: &str, status: &str) -> Result<()> {
        sqlx::query(
            r#"
            UPDATE notifications
            SET status = ?
            WHERE id = ?
            "#,
        )
        .bind(status)
        .bind(id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn like_post(&self, post_id: &str, user_id: &str) -> Result<bool> {
        // Check if like already exists
        let existing_like: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM likes WHERE post_id = ? AND user_id = ?")
                .bind(post_id)
                .bind(user_id)
                .fetch_one(&self.pool)
                .await?;

        let is_liked = existing_like.0 > 0;

        if is_liked {
            // Unlike
            sqlx::query("DELETE FROM likes WHERE post_id = ? AND user_id = ?")
                .bind(post_id)
                .bind(user_id)
                .execute(&self.pool)
                .await?;

            // Decrement likes count
            sqlx::query("UPDATE posts SET likes_count = likes_count - 1 WHERE id = ?")
                .bind(post_id)
                .execute(&self.pool)
                .await?;

            Ok(false)
        } else {
            // Like
            let like_id = Uuid::new_v4();
            let now = Utc::now().to_rfc3339();

            sqlx::query("INSERT INTO likes (id, post_id, user_id, created_at) VALUES (?, ?, ?, ?)")
                .bind(like_id.to_string())
                .bind(post_id)
                .bind(user_id)
                .bind(now)
                .execute(&self.pool)
                .await?;

            // Increment likes count
            sqlx::query("UPDATE posts SET likes_count = likes_count + 1 WHERE id = ?")
                .bind(post_id)
                .execute(&self.pool)
                .await?;

            Ok(true)
        }
    }

    // Comment operations
    pub async fn create_comment(
        &self,
        post_id: &str,
        user_id: &str,
        content: &str,
        parent_comment_id: Option<&str>,
    ) -> Result<Comment> {
        let comment_id = Uuid::new_v4();
        let now = Utc::now().to_rfc3339();

        let mut tx = self.pool.begin().await?;

        sqlx::query(
            r#"
            INSERT INTO comments (id, post_id, user_id, content, parent_comment_id, likes_count, created_at)
            VALUES (?, ?, ?, ?, ?, 0, ?)
            "#,
        )
        .bind(comment_id.to_string())
        .bind(post_id)
        .bind(user_id)
        .bind(content)
        .bind(parent_comment_id)
        .bind(&now)
        .execute(&mut *tx)
        .await?;

        sqlx::query("UPDATE posts SET comments_count = comments_count + 1 WHERE id = ?")
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
                .map(|id| Uuid::parse_str(id))
                .transpose()?,
            created_at: chrono::DateTime::parse_from_rfc3339(&now)?.with_timezone(&Utc),
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
                c.id as comment_id, c.post_id, c.user_id, c.content, c.parent_comment_id, c.created_at as comment_created_at,
                u.username, u.avatar_url, u.token_symbol, u.wallet_address, u.bio, u.followers_count
            FROM comments c
            JOIN users u ON c.user_id = u.id
            WHERE c.post_id = ?
            ORDER BY c.created_at ASC
            LIMIT ? OFFSET ?
            "#,
        )
        .bind(post_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await?;

        let mut comments = Vec::new();
        for row in rows {
            let comment_id: String = row.get("comment_id");
            let comment_created_at: String = row.get("comment_created_at");
            let user_id: String = row.get("user_id");
            let parent_comment_id: Option<String> = row.get("parent_comment_id");

            comments.push(CommentWithAuthor {
                comment: Comment {
                    id: Uuid::parse_str(&comment_id)?,
                    post_id: Uuid::parse_str(post_id)?,
                    user_id: Uuid::parse_str(&user_id)?,
                    content: row.get("content"),
                    parent_comment_id: parent_comment_id
                        .as_deref()
                        .map(Uuid::parse_str)
                        .transpose()?,
                    created_at: chrono::DateTime::parse_from_rfc3339(&comment_created_at)?
                        .with_timezone(&Utc),
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
            });
        }

        Ok(comments)
    }

    pub async fn get_post_author_id(&self, post_id: &str) -> Result<Option<String>> {
        let row = sqlx::query("SELECT user_id FROM posts WHERE id = ?")
            .bind(post_id)
            .fetch_optional(&self.pool)
            .await?;

        Ok(row.map(|r| r.get("user_id")))
    }

    pub async fn get_comment_author_and_post(
        &self,
        comment_id: &str,
    ) -> Result<Option<(String, String)>> {
        let row = sqlx::query("SELECT user_id, post_id FROM comments WHERE id = ?")
            .bind(comment_id)
            .fetch_optional(&self.pool)
            .await?;

        Ok(row.map(|r| (r.get("user_id"), r.get("post_id"))))
    }

    pub async fn mark_all_notifications_read(&self, user_id: &str) -> Result<u64> {
        let result = sqlx::query(
            "UPDATE notifications SET status = 'read' WHERE user_id = ? AND status != 'read'",
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
                AND LOWER(u2.username) = LOWER(SUBSTR(n.content, 2, INSTR(SUBSTR(n.content, 2), ' ') - 1))
            WHERE n.user_id = ?
            ORDER BY n.created_at DESC
            "#,
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await?;

        let mut notifications = Vec::new();
        for row in rows {
            let created_at: String = row.get("created_at");
            notifications.push(Notification {
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
                created_at: Self::parse_db_timestamp(&created_at)?,
            });
        }

        Ok(notifications)
    }

    pub async fn delete_post(&self, post_id: &str, user_id: &str) -> Result<bool> {
        let mut tx = self.pool.begin().await?;

        let row = sqlx::query("SELECT user_id FROM posts WHERE id = ?")
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

        sqlx::query("DELETE FROM posts WHERE id = ?")
            .bind(post_id)
            .execute(&mut *tx)
            .await?;

        sqlx::query(
            "UPDATE users SET posts_count = CASE WHEN posts_count > 0 THEN posts_count - 1 ELSE 0 END WHERE id = ?"
        )
        .bind(user_id)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(true)
    }

    // Follow operations
    pub async fn follow_user(&self, follower_id: &Uuid, following_id: &Uuid) -> Result<bool> {
        // Can't follow yourself
        if follower_id == following_id {
            return Ok(false);
        }

        // Check if already following
        let existing: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM follows WHERE follower_id = ? AND following_id = ?",
        )
        .bind(follower_id.to_string())
        .bind(following_id.to_string())
        .fetch_one(&self.pool)
        .await?;

        if existing.0 > 0 {
            return Ok(false); // Already following
        }

        // Create follow record
        let follow_id = Uuid::new_v4();
        let now = Utc::now().to_rfc3339();

        sqlx::query(
            "INSERT INTO follows (id, follower_id, following_id, created_at) VALUES (?, ?, ?, ?)",
        )
        .bind(follow_id.to_string())
        .bind(follower_id.to_string())
        .bind(following_id.to_string())
        .bind(&now)
        .execute(&self.pool)
        .await?;

        // Note: followers_count/following_count on users table represents share holders,
        // not social follows. Social follows are tracked in the follows table only.

        Ok(true)
    }

    pub async fn unfollow_user(&self, follower_id: &Uuid, following_id: &Uuid) -> Result<bool> {
        // Check if following
        let existing: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM follows WHERE follower_id = ? AND following_id = ?",
        )
        .bind(follower_id.to_string())
        .bind(following_id.to_string())
        .fetch_one(&self.pool)
        .await?;

        if existing.0 == 0 {
            return Ok(false); // Not following
        }

        // Delete follow record
        sqlx::query("DELETE FROM follows WHERE follower_id = ? AND following_id = ?")
            .bind(follower_id.to_string())
            .bind(following_id.to_string())
            .execute(&self.pool)
            .await?;

        // Note: followers_count/following_count on users table represents share holders,
        // not social follows. Social follows are tracked in the follows table only.

        Ok(true)
    }

    pub async fn is_following(&self, follower_id: &Uuid, following_id: &Uuid) -> bool {
        let result: std::result::Result<(i64,), sqlx::Error> = sqlx::query_as(
            "SELECT COUNT(*) FROM follows WHERE follower_id = ? AND following_id = ?",
        )
        .bind(follower_id.to_string())
        .bind(following_id.to_string())
        .fetch_one(&self.pool)
        .await;

        result.map(|(count,)| count > 0).unwrap_or(false)
    }

    pub async fn get_follow_counts(&self, user_id: &Uuid) -> (i64, i64) {
        let result: std::result::Result<(i64, i64), sqlx::Error> =
            sqlx::query_as("SELECT followers_count, following_count FROM users WHERE id = ?")
                .bind(user_id.to_string())
                .fetch_one(&self.pool)
                .await;

        result.unwrap_or((0, 0))
    }
}
