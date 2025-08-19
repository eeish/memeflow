use crate::models::*;
use anyhow::Result;
use chrono::Utc;
use sqlx::{SqlitePool, Row};
use std::env;
use uuid::Uuid;

// SQLite database for persistent storage
#[derive(Debug, Clone)]
pub struct Database {
    pub pool: SqlitePool,
}

impl Database {
    pub async fn new() -> Result<Self> {
        // Get database URL from environment or use default
        let database_url = env::var("DATABASE_URL")
            .unwrap_or_else(|_| "sqlite:./memeflow.db".to_string());
        
        println!("🗄️  Connecting to database: {}", database_url);
        
        // Create connection pool
        let pool = SqlitePool::connect(&database_url).await?;
        
        let db = Self { pool };
        
        // Create tables
        db.create_tables().await?;
        
        // Add sample data if tables are empty
        if db.is_empty().await? {
            db.init_sample_data().await?;
        }
        
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
                followers_count INTEGER DEFAULT 0,
                following_count INTEGER DEFAULT 0,
                posts_count INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
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
                likes_count INTEGER DEFAULT 0,
                comments_count INTEGER DEFAULT 0,
                retweets_count INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
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
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (post_id) REFERENCES posts (id),
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
            "#,
        )
        .execute(&self.pool)
        .await?;
        
        // Post likes table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS post_likes (
                id TEXT PRIMARY KEY,
                post_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(post_id, user_id),
                FOREIGN KEY (post_id) REFERENCES posts (id),
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
            "#,
        )
        .execute(&self.pool)
        .await?;
        
        // User follows table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS user_follows (
                id TEXT PRIMARY KEY,
                follower_id TEXT NOT NULL,
                following_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(follower_id, following_id),
                FOREIGN KEY (follower_id) REFERENCES users (id),
                FOREIGN KEY (following_id) REFERENCES users (id)
            )
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
                notification_type TEXT NOT NULL,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                is_read BOOLEAN DEFAULT FALSE,
                metadata TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
            "#,
        )
        .execute(&self.pool)
        .await?;
        
        // Token metadata table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS token_metadata (
                symbol TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                creator_id TEXT NOT NULL,
                total_supply TEXT NOT NULL,
                current_price TEXT NOT NULL,
                market_cap TEXT NOT NULL,
                volume_24h TEXT NOT NULL,
                price_change_24h REAL NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (creator_id) REFERENCES users (id)
            )
            "#,
        )
        .execute(&self.pool)
        .await?;
        
        println!("✅ Database tables created successfully");
        Ok(())
    }
    
    async fn is_empty(&self) -> Result<bool> {
        let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
            .fetch_one(&self.pool)
            .await?;
        Ok(count.0 == 0)
    }

    async fn init_sample_data(&mut self) -> Result<()> {
        // Sample users
        let user1_id = Uuid::new_v4();
        let user1 = User {
            id: user1_id,
            wallet_address: Some("0x1234567890abcdef".to_string()),
            email: None,
            username: "cryptokid".to_string(),
            display_name: Some("Crypto Kid".to_string()),
            avatar_url: None,
            bio: Some("Meme token enthusiast 🚀".to_string()),
            token_symbol: "CRYPTOKID".to_string(),
            followers_count: 1250,
            following_count: 500,
            posts_count: 89,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        let user2_id = Uuid::new_v4();
        let user2 = User {
            id: user2_id,
            wallet_address: Some("0xabcdef1234567890".to_string()),
            email: None,
            username: "moonlambo".to_string(),
            display_name: Some("Moon Lambo".to_string()),
            avatar_url: None,
            bio: Some("To the moon! 🌙🚗".to_string()),
            token_symbol: "MOONLAMBO".to_string(),
            followers_count: 2100,
            following_count: 750,
            posts_count: 156,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        self.users.insert(user1_id, user1.clone());
        self.users.insert(user2_id, user2.clone());

        // Sample token metadata
        let token1 = TokenMetadata {
            symbol: "CRYPTOKID".to_string(),
            name: "CryptoKid Token".to_string(),
            description: Some("The official token of CryptoKid - spreading meme magic!".to_string()),
            image_url: Some("https://example.com/cryptokid.png".to_string()),
            website_url: Some("https://cryptokid.com".to_string()),
            twitter_url: Some("https://twitter.com/cryptokid".to_string()),
            discord_url: None,
            total_supply: Some("1000000000".to_string()),
            creator_id: user1_id,
            market_cap_usd: Some(125000.0),
            price_usd: Some(0.000125),
            volume_24h_usd: Some(15000.0),
            holders_count: 342,
            is_verified: true,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        self.token_metadata.insert("CRYPTOKID".to_string(), token1);

        // Sample posts
        let post1_id = Uuid::new_v4();
        let post1 = Post {
            id: post1_id,
            author_id: user1_id,
            content: "Just launched my personal token! 🚀 $CRYPTOKID is going to the moon! Who wants to buy in? #MemeFlow #ToTheMoon".to_string(),
            media_urls: vec![],
            likes_count: 42,
            comments_count: 12,
            reposts_count: 8,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        self.posts.insert(post1_id, post1);

        Ok(())
    }

    // User operations
    pub async fn create_user(&mut self, request: CreateUserRequest) -> Result<User> {
        let user_id = Uuid::new_v4();
        let token_symbol = request.username.to_uppercase();
        
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

        self.users.insert(user_id, user.clone());
        Ok(user)
    }

    pub async fn get_user(&self, user_id: &Uuid) -> Option<User> {
        self.users.get(user_id).cloned()
    }

    pub async fn get_user_by_username(&self, username: &str) -> Option<User> {
        self.users.values()
            .find(|u| u.username == username)
            .cloned()
    }

    pub async fn update_user_profile(&mut self, user_id: &Uuid, request: UpdateProfileRequest) -> Result<Option<User>> {
        if let Some(user) = self.users.get_mut(user_id) {
            if let Some(display_name) = request.display_name {
                user.display_name = Some(display_name);
            }
            if let Some(bio) = request.bio {
                user.bio = Some(bio);
            }
            if let Some(avatar_url) = request.avatar_url {
                user.avatar_url = Some(avatar_url);
            }
            user.updated_at = Utc::now();
            Ok(Some(user.clone()))
        } else {
            Ok(None)
        }
    }

    // Post operations
    pub async fn create_post(&mut self, request: CreatePostRequest) -> Result<Post> {
        let post_id = Uuid::new_v4();
        let post = Post {
            id: post_id,
            author_id: request.author_id,
            content: request.content,
            media_urls: request.media_urls.unwrap_or_default(),
            likes_count: 0,
            comments_count: 0,
            reposts_count: 0,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        self.posts.insert(post_id, post.clone());
        
        // Update user post count
        let author_username = if let Some(user) = self.users.get_mut(&request.author_id) {
            user.posts_count += 1;
            user.username.clone()
        } else {
            "unknown".to_string()
        };

        // Send notifications to followers about the new post
        let followers = self.get_followers(&request.author_id).await;
        for follower in followers {
            let notification = Notification {
                id: Uuid::new_v4(),
                user_id: follower.id,
                title: "New Post".to_string(),
                content: format!("{} posted: {}", author_username, 
                    if post.content.len() > 50 { 
                        format!("{}...", &post.content[..50]) 
                    } else { 
                        post.content.clone() 
                    }
                ),
                notification_type: NotificationType::Mention, // Using Mention as generic post notification
                related_id: Some(post_id),
                is_read: false,
                created_at: Utc::now(),
            };
            
            self.notifications.entry(follower.id).or_insert_with(Vec::new).push(notification);
        }

        Ok(post)
    }

    pub async fn get_posts(&self, limit: usize, offset: usize) -> Vec<PostWithAuthor> {
        let mut posts: Vec<_> = self.posts.values().collect();
        posts.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        
        posts.into_iter()
            .skip(offset)
            .take(limit)
            .filter_map(|post| {
                self.users.get(&post.author_id).map(|user| PostWithAuthor {
                    post: post.clone(),
                    author: UserProfile {
                        id: user.id,
                        username: user.username.clone(),
                        display_name: user.display_name.clone(),
                        avatar_url: user.avatar_url.clone(),
                        token_symbol: user.token_symbol.clone(),
                    },
                })
            })
            .collect()
    }

    pub async fn like_post(&mut self, post_id: &Uuid, user_id: &Uuid) -> Result<bool> {
        // Check if user already liked this post
        let user_likes = self.post_likes.entry(*post_id).or_insert_with(Vec::new);
        
        if user_likes.contains(user_id) {
            // Unlike
            user_likes.retain(|&id| id != *user_id);
            if let Some(post) = self.posts.get_mut(post_id) {
                post.likes_count = post.likes_count.saturating_sub(1);
            }
            Ok(false)
        } else {
            // Like
            user_likes.push(*user_id);
            if let Some(post) = self.posts.get_mut(post_id) {
                post.likes_count += 1;
            }
            Ok(true)
        }
    }

    // Search operations
    pub async fn search_users(&self, query: &str, limit: usize, offset: usize) -> Vec<UserProfile> {
        let query_lower = query.to_lowercase();
        let mut users: Vec<_> = self.users.values()
            .filter(|user| {
                user.username.to_lowercase().contains(&query_lower) ||
                user.display_name.as_ref().map_or(false, |name| name.to_lowercase().contains(&query_lower)) ||
                user.token_symbol.to_lowercase().contains(&query_lower)
            })
            .collect();
        
        users.sort_by(|a, b| b.followers_count.cmp(&a.followers_count));
        
        users.into_iter()
            .skip(offset)
            .take(limit)
            .map(|user| UserProfile {
                id: user.id,
                username: user.username.clone(),
                display_name: user.display_name.clone(),
                avatar_url: user.avatar_url.clone(),
                token_symbol: user.token_symbol.clone(),
            })
            .collect()
    }

    pub async fn search_tokens(&self, query: &str, limit: usize, offset: usize) -> Vec<TokenMetadata> {
        let query_lower = query.to_lowercase();
        let mut tokens: Vec<_> = self.token_metadata.values()
            .filter(|token| {
                token.symbol.to_lowercase().contains(&query_lower) ||
                token.name.to_lowercase().contains(&query_lower) ||
                token.description.as_ref().map_or(false, |desc| desc.to_lowercase().contains(&query_lower))
            })
            .collect();
        
        tokens.sort_by(|a, b| b.market_cap_usd.partial_cmp(&a.market_cap_usd).unwrap_or(std::cmp::Ordering::Equal));
        
        tokens.into_iter()
            .skip(offset)
            .take(limit)
            .cloned()
            .collect()
    }

    // Follow operations
    pub async fn follow_user(&mut self, follower_id: &Uuid, following_id: &Uuid) -> Result<bool> {
        if follower_id == following_id {
            return Ok(false); // Can't follow yourself
        }
        
        let following_list = self.user_follows.entry(*follower_id).or_insert_with(Vec::new);
        
        if following_list.contains(following_id) {
            return Ok(false); // Already following
        }
        
        // Add to following list
        following_list.push(*following_id);
        
        // Update follower's following count
        if let Some(follower) = self.users.get_mut(follower_id) {
            follower.following_count += 1;
        }
        
        // Update followed user's followers count
        if let Some(followed) = self.users.get_mut(following_id) {
            followed.followers_count += 1;
        }
        
        // Create notification for the followed user
        let notification = Notification {
            id: Uuid::new_v4(),
            user_id: *following_id,
            title: "New Follower".to_string(),
            content: format!("You have a new follower!"),
            notification_type: NotificationType::Follow,
            related_id: Some(*follower_id),
            is_read: false,
            created_at: Utc::now(),
        };
        
        self.notifications.entry(*following_id).or_insert_with(Vec::new).push(notification);
        
        Ok(true)
    }
    
    pub async fn unfollow_user(&mut self, follower_id: &Uuid, following_id: &Uuid) -> Result<bool> {
        let following_list = self.user_follows.entry(*follower_id).or_insert_with(Vec::new);
        
        if let Some(pos) = following_list.iter().position(|&id| id == *following_id) {
            following_list.remove(pos);
            
            // Update follower's following count
            if let Some(follower) = self.users.get_mut(follower_id) {
                follower.following_count = follower.following_count.saturating_sub(1);
            }
            
            // Update followed user's followers count
            if let Some(followed) = self.users.get_mut(following_id) {
                followed.followers_count = followed.followers_count.saturating_sub(1);
            }
            
            Ok(true)
        } else {
            Ok(false) // Was not following
        }
    }
    
    pub async fn is_following(&self, follower_id: &Uuid, following_id: &Uuid) -> bool {
        self.user_follows.get(follower_id)
            .map_or(false, |following_list| following_list.contains(following_id))
    }
    
    pub async fn get_followers(&self, user_id: &Uuid) -> Vec<UserProfile> {
        self.user_follows.iter()
            .filter_map(|(follower_id, following_list)| {
                if following_list.contains(user_id) {
                    self.users.get(follower_id).map(|user| UserProfile {
                        id: user.id,
                        username: user.username.clone(),
                        display_name: user.display_name.clone(),
                        avatar_url: user.avatar_url.clone(),
                        token_symbol: user.token_symbol.clone(),
                    })
                } else {
                    None
                }
            })
            .collect()
    }
    
    pub async fn get_following(&self, user_id: &Uuid) -> Vec<UserProfile> {
        self.user_follows.get(user_id)
            .map(|following_list| {
                following_list.iter()
                    .filter_map(|following_id| {
                        self.users.get(following_id).map(|user| UserProfile {
                            id: user.id,
                            username: user.username.clone(),
                            display_name: user.display_name.clone(),
                            avatar_url: user.avatar_url.clone(),
                            token_symbol: user.token_symbol.clone(),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default()
    }
    
    // News feed operations
    pub async fn get_news_feed(&self, user_id: &Uuid, limit: usize, offset: usize) -> Vec<PostWithAuthor> {
        // Get list of users this user follows
        let following_list = self.user_follows.get(user_id).cloned().unwrap_or_default();
        
        // Include user's own posts in feed
        let mut feed_user_ids = following_list.clone();
        feed_user_ids.push(*user_id);
        
        // Get posts from followed users and self
        let mut feed_posts: Vec<_> = self.posts.values()
            .filter(|post| feed_user_ids.contains(&post.author_id))
            .collect();
        
        // Sort by creation time (newest first)
        feed_posts.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        
        // Apply pagination and convert to PostWithAuthor
        feed_posts.into_iter()
            .skip(offset)
            .take(limit)
            .filter_map(|post| {
                self.users.get(&post.author_id).map(|user| PostWithAuthor {
                    post: post.clone(),
                    author: UserProfile {
                        id: user.id,
                        username: user.username.clone(),
                        display_name: user.display_name.clone(),
                        avatar_url: user.avatar_url.clone(),
                        token_symbol: user.token_symbol.clone(),
                    },
                })
            })
            .collect()
    }
    
    // Notification operations
    pub async fn get_user_notifications(&self, user_id: &Uuid) -> Vec<Notification> {
        self.notifications.get(user_id).cloned().unwrap_or_default()
    }
    
    pub async fn mark_notification_read(&mut self, notification_id: &Uuid) -> Result<bool> {
        for notifications in self.notifications.values_mut() {
            if let Some(notification) = notifications.iter_mut().find(|n| n.id == *notification_id) {
                notification.is_read = true;
                return Ok(true);
            }
        }
        Ok(false)
    }
    
    pub async fn create_notification(&mut self, user_id: &Uuid, title: String, content: String, notification_type: NotificationType, related_id: Option<Uuid>) -> Result<Notification> {
        let notification = Notification {
            id: Uuid::new_v4(),
            user_id: *user_id,
            title,
            content,
            notification_type,
            related_id,
            is_read: false,
            created_at: Utc::now(),
        };
        
        self.notifications.entry(*user_id).or_insert_with(Vec::new).push(notification.clone());
        Ok(notification)
    }

    // Token operations
    pub async fn get_token_metadata(&self, symbol: &str) -> Option<TokenMetadata> {
        self.token_metadata.get(symbol).cloned()
    }

    pub async fn update_token_metadata(&mut self, symbol: &str, request: UpdateTokenMetadataRequest) -> Result<Option<TokenMetadata>> {
        if let Some(token) = self.token_metadata.get_mut(symbol) {
            if let Some(description) = request.description {
                token.description = Some(description);
            }
            if let Some(image_url) = request.image_url {
                token.image_url = Some(image_url);
            }
            if let Some(website_url) = request.website_url {
                token.website_url = Some(website_url);
            }
            if let Some(twitter_url) = request.twitter_url {
                token.twitter_url = Some(twitter_url);
            }
            if let Some(discord_url) = request.discord_url {
                token.discord_url = Some(discord_url);
            }
            token.updated_at = Utc::now();
            Ok(Some(token.clone()))
        } else {
            Ok(None)
        }
    }

    pub async fn get_trending_tokens(&self, limit: usize) -> Vec<TokenMetadata> {
        let mut tokens: Vec<_> = self.token_metadata.values().collect();
        tokens.sort_by(|a, b| {
            b.volume_24h_usd.partial_cmp(&a.volume_24h_usd)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        
        tokens.into_iter()
            .take(limit)
            .cloned()
            .collect()
    }
}