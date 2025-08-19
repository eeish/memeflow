use crate::models::*;
use sqlx::{SqlitePool, Row};
use uuid::Uuid;
use chrono::Utc;
use std::path::Path;

type Result<T> = anyhow::Result<T>;

#[derive(Clone)]
pub struct Database {
    pool: SqlitePool,
}

impl Database {
    pub async fn new() -> Result<Self> {
        // Use persistent file-based database
        let database_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "sqlite:./db/memeflow.db".to_string());
            
        println!("🗄️  Connecting to database: {}", database_url);
        
        // Create db directory if it doesn't exist
        let db_path = database_url.replace("sqlite:", "");
        if let Some(parent) = Path::new(&db_path).parent() {
            if !parent.exists() {
                println!("📁 Creating database directory: {:?}", parent);
                std::fs::create_dir_all(parent)?;
            }
        }
        
        // Try to connect to database with proper error handling
        println!("📞 Attempting to connect to database...");
        let pool = match SqlitePool::connect(&database_url).await {
            Ok(pool) => {
                println!("✅ Successfully connected to database");
                pool
            },
            Err(e) => {
                eprintln!("❌ Failed to connect to database: {}", e);
                eprintln!("Database path: {}", db_path);
                eprintln!("Working directory: {:?}", std::env::current_dir());
                
                // Try creating the file explicitly
                if !Path::new(&db_path).exists() {
                    println!("📝 Creating database file: {}", db_path);
                    std::fs::File::create(&db_path)?;
                }
                
                // Retry connection
                println!("🔄 Retrying database connection...");
                SqlitePool::connect(&database_url).await?
            }
        };
        
        let db = Self { pool };
        
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
                display_name TEXT,
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

        // Posts table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS posts (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                content TEXT NOT NULL,
                image_url TEXT,
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
                likes_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            );
            "#,
        )
        .execute(&self.pool)
        .await?;

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

        // Notifications table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS notifications (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                notification_type TEXT NOT NULL,
                related_id TEXT,
                is_read BOOLEAN NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            );
            "#,
        )
        .execute(&self.pool)
        .await?;
        
        println!("✅ Database tables created successfully");
        Ok(())
    }
    
    
    // User operations
    pub async fn create_user(&self, request: CreateUserRequest) -> Result<User> {
        let user_id = Uuid::new_v4();
        let now = Utc::now().to_rfc3339();
        let token_symbol = request.username.to_uppercase();
        
        sqlx::query(
            r#"
            INSERT INTO users (id, wallet_address, email, username, display_name, avatar_url, bio, 
                             token_symbol, followers_count, following_count, posts_count, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?)
            "#,
        )
        .bind(user_id.to_string())
        .bind(&request.wallet_address)
        .bind(&request.email)
        .bind(&request.username)
        .bind(&request.display_name)
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
            display_name: request.display_name,
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
            "SELECT id, wallet_address, email, username, display_name, avatar_url, bio, token_symbol, followers_count, following_count, posts_count, created_at, updated_at FROM users WHERE wallet_address = ?"
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
                display_name: row.get("display_name"),
                avatar_url: row.get("avatar_url"),
                bio: row.get("bio"),
                token_symbol: row.get("token_symbol"),
                followers_count: row.get("followers_count"),
                following_count: row.get("following_count"),
                posts_count: row.get("posts_count"),
                created_at: chrono::DateTime::parse_from_rfc3339(row.get("created_at"))?.with_timezone(&Utc),
                updated_at: chrono::DateTime::parse_from_rfc3339(row.get("updated_at"))?.with_timezone(&Utc),
            }))
        } else {
            Ok(None)
        }
    }

    pub async fn user_exists_by_address(&self, wallet_address: &str) -> Result<bool> {
        let count: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM users WHERE wallet_address = ?"
        )
        .bind(wallet_address)
        .fetch_one(&self.pool)
        .await?;
        
        Ok(count.0 > 0)
    }

    // Post operations
    pub async fn create_post(&self, request: CreatePostRequest) -> Result<Post> {
        let post_id = Uuid::new_v4();
        let author_id = Uuid::parse_str(&request.author_id)?;
        let now = Utc::now().to_rfc3339();
        
        sqlx::query(
            r#"
            INSERT INTO posts (id, user_id, content, image_url, likes_count, comments_count, retweets_count, created_at, updated_at)
            VALUES (?, ?, ?, ?, 0, 0, 0, ?, ?)
            "#,
        )
        .bind(post_id.to_string())
        .bind(request.author_id)
        .bind(&request.content)
        .bind::<Option<String>>(None) // image_url
        .bind(&now)
        .bind(&now)
        .execute(&self.pool)
        .await?;
        
        Ok(Post {
            id: post_id,
            author_id: author_id,
            content: request.content,
            media_urls: request.media_urls.unwrap_or_default(),
            likes_count: 0,
            comments_count: 0,
            reposts_count: 0,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        })
    }

    pub async fn get_plaza_posts(&self, limit: Option<i32>, offset: Option<i32>) -> Result<Vec<PostWithAuthor>> {
        let limit = limit.unwrap_or(50);
        let offset = offset.unwrap_or(0);
        
        let rows = sqlx::query(
            r#"
            SELECT 
                p.id as post_id, p.user_id, p.content, p.image_url, 
                p.likes_count, p.comments_count, p.retweets_count, 
                p.created_at as post_created_at, p.updated_at as post_updated_at,
                u.username, u.display_name, u.avatar_url, u.bio, u.token_symbol
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
            
            let post = PostWithAuthor {
                post: Post {
                    id: Uuid::parse_str(&post_id)?,
                    author_id: Uuid::parse_str(&user_id)?,
                    content: row.get("content"),
                    media_urls: vec![],
                    likes_count: row.get("likes_count"),
                    comments_count: row.get("comments_count"),
                    reposts_count: row.get("retweets_count"),
                    created_at: chrono::DateTime::parse_from_rfc3339(&created_at)?.with_timezone(&Utc),
                    updated_at: chrono::DateTime::parse_from_rfc3339(&updated_at)?.with_timezone(&Utc),
                },
                author: UserProfile {
                    id: Uuid::parse_str(&user_id)?,
                    username: row.get("username"),
                    display_name: row.get("display_name"),
                    avatar_url: row.get("avatar_url"),
                    token_symbol: row.get("token_symbol"),
                },
            };
            posts.push(post);
        }
        
        Ok(posts)
    }

    pub async fn like_post(&self, post_id: &str, user_id: &str) -> Result<bool> {
        // Check if like already exists
        let existing_like: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM likes WHERE post_id = ? AND user_id = ?"
        )
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
            
            sqlx::query(
                "INSERT INTO likes (id, post_id, user_id, created_at) VALUES (?, ?, ?, ?)"
            )
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
}