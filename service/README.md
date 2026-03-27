# Cord Service

A Rust-based backend service for the Cord social trading platform, handling all non-blockchain functionality including user management, social features, analytics, and token metadata.

## 🚀 Features

### Core Functionality
- **User Management**: Registration, profiles, and social connections
- **Social Feed**: Posts, likes, comments, and interactions
- **Token Metadata**: Non-blockchain token information and analytics
- **Search**: Users and tokens discovery
- **Analytics**: Platform metrics and insights
- **Notifications**: Real-time user notifications

### Technical Stack
- **Framework**: Axum (async web framework)
- **Database**: SQLx with PostgreSQL (managed via `sqlx migrate`)
- **Authentication**: JWT tokens with bcrypt hashing
- **CORS**: Configured for frontend integration
- **Logging**: tracing / tracing-subscriber

## 🛠 Development Setup

### Prerequisites
- Rust 1.70+
- Docker (for local PostgreSQL)

### Quick Start

```bash
# 1. Start local PostgreSQL (from repo root)
npm run db:start
# or: docker compose -f docker-compose.dev.yml up -d postgres

# 2. Copy environment template and edit if needed
cp service/.env.example service/.env

# 3. Run the service (migrations run automatically on startup)
cd service
RUST_LOG=info cargo run

# The service starts on http://localhost:3001
```

### Build for Production

```bash
cargo build --release
```

### Database Management

```bash
# Check table counts and service status
npm run db:check

# Truncate all tables (preserves schema)
npm run db:reset

# Stop local Postgres container
npm run db:stop
```

## 🔍 Sui Address Verification

Cord Service includes comprehensive Sui address verification to ensure new users and prevent duplicate registrations:

### Key Features:
- **Address Format Validation**: Validates Sui address format (0x + 64 hex chars)
- **Address Normalization**: Normalizes addresses to canonical 32-byte format
- **New User Detection**: Checks if address already exists in database
- **On-Chain Verification**: Queries Sui network for balance and transaction history
- **Duplicate Prevention**: Prevents multiple accounts per Sui address

### Verification Flow:
1. Frontend connects wallet and gets user's Sui address
2. Service validates address format and normalizes it
3. Service checks if user already exists with this address
4. Service queries Sui network for on-chain activity
5. Service returns comprehensive verification result

## 📚 API Endpoints

### Health Check
- `GET /health` - Service health status

### User Management
- `POST /api/users` - Create new user (with Sui address verification)
- `GET /api/users/:id` - Get user profile
- `GET /api/users/by-address/:address` - Get user by Sui wallet address
- `POST /api/users/:id/profile` - Update user profile

### Social Features
- `GET /api/posts` - Get posts feed
- `POST /api/posts` - Create new post
- `DELETE /api/posts/:id` - Delete a post (author only)
- `POST /api/posts/:id/like` - Like/unlike post
- `POST /api/posts/:id/comment` - Comment on post

### Token Metadata
- `GET /api/tokens/:symbol/metadata` - Get token metadata
- `POST /api/tokens/:symbol/metadata` - Update token metadata
- `GET /api/tokens/trending` - Get trending tokens

### Search
- `GET /api/search/users?q=query` - Search users
- `GET /api/search/tokens?q=query` - Search tokens

### Analytics
- `GET /api/analytics/users` - Platform analytics
- `GET /api/analytics/tokens` - Token analytics

### Sui Address Verification
- `GET /api/verify/address/:address` - Comprehensive Sui address verification
- `GET /api/verify/user-exists/:address` - Check if user exists by address
- `GET /api/users/by-address/:address` - Get user profile by Sui address

### Notifications
- `GET /api/notifications/:user_id` - Get user notifications
- `POST /api/notifications/:id/mark-read` - Mark notification read

## 🔧 Configuration

### Environment Variables

```bash
# Database — PostgreSQL connection string
# Local dev:   postgres://cord:cord@localhost:5432/cord
# Railway:     injected automatically by the Postgres plugin
DATABASE_URL=postgres://cord:cord@localhost:5432/cord

# Server
HOST=0.0.0.0
PORT=3001

# JWT Secret
JWT_SECRET=your-secret-key-here

# Logging
RUST_LOG=info

# Graduation operator
GRADUATION_OPERATOR_NETWORK=testnet
GRADUATION_OPERATOR_RPC_URL=https://fullnode.testnet.sui.io:443
GRADUATION_OPERATOR_ADDRESS=0x...
GRADUATION_OPERATOR_PRIVATE_KEY=suiprivkey...

# Optional overrides if you do not want to read from public/deployment-<network>.json
CORD_CONTRACT_PACKAGE_ID=0x...
CORD_GRADUATION_REGISTRY_ID=0x...
```

### CORS Configuration
The service is configured to accept requests from any origin during development. For production, update the CORS settings in `main.rs`:

```rust
let cors = CorsLayer::new()
    .allow_origin("http://localhost:5173".parse::<HeaderValue>().unwrap())
    .allow_methods([Method::GET, Method::POST])
    .allow_headers(Any);
```

## 📊 Database Schema

### Users Table
- `id` - UUID primary key
- `wallet_address` - Optional Sui wallet address
- `email` - Optional email for traditional auth
- `username` - Unique username (becomes token symbol)
- `avatar_url` - Profile picture URL
- `bio` - User biography
- `token_symbol` - Associated token symbol
- Counters: `followers_count`, `following_count`, `posts_count`
- Timestamps: `created_at`, `updated_at`

### Posts Table
- `id` - UUID primary key
- `author_id` - User who created the post
- `content` - Post content
- `media_urls` - JSON array of media URLs
- Counters: `likes_count`, `comments_count`, `reposts_count`
- Timestamps: `created_at`, `updated_at`

### Token Metadata Table
- `symbol` - Token symbol (primary key)
- `name` - Token name
- `description` - Token description
- Social links: `website_url`, `twitter_url`, `discord_url`
- Market data: `market_cap_usd`, `price_usd`, `volume_24h_usd`
- `holders_count` - Number of token holders
- `is_verified` - Verification status
- `creator_id` - User who created the token

## 🔌 Frontend Integration

### Making API Calls

```typescript
// Example: Verify Sui address (comprehensive check)
const suiAddress = "0x1234567890abcdef1234567890abcdef12345678";
const response = await fetch(`http://localhost:3001/api/verify/address/${suiAddress}`);
const data = await response.json();

if (data.success) {
    console.log('Verification result:', data.data);
    /*
    {
        is_valid: true,
        is_new_user: true,
        address: "0x1234...",
        normalized_address: "0x0000...1234567890abcdef1234567890abcdef12345678",
        on_chain_data: {
            has_transactions: false,
            transaction_count: 0,
            balance: 0,
            is_active: false
        },
        error: null
    }
    */
} else {
    console.error('Verification failed:', data.error);
}

// Example: Quick check if user exists
const userExists = await fetch(`http://localhost:3001/api/verify/user-exists/${suiAddress}`);
const existsData = await userExists.json();

if (existsData.success && !existsData.data) {
    console.log('New user - can proceed with registration');
} else {
    console.log('User already exists');
}

// Example: Create user with wallet verification
const newUser = {
    wallet_address: suiAddress,
    username: "cryptotrader"
};

const response = await fetch('http://localhost:3001/api/users', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify(newUser),
});

// Example: Get posts feed
const postsResponse = await fetch('http://localhost:3001/api/posts?limit=20&offset=0');
const postsData = await postsResponse.json();

if (postsData.success) {
    console.log('Posts:', postsData.data);
} else {
    console.error('Error:', postsData.error);
}
```

### Response Format
All API responses follow this format:

```json
{
    "success": true,
    "data": { /* response data */ },
    "error": null,
    "message": null
}
```

## 🧪 Testing

```bash
# Run tests
cargo test

# Run with output
cargo test -- --nocapture

# Test specific module
cargo test database
```

## 🚀 Deployment

### Railway (recommended)

1. Push this repo to GitHub.
2. Create a new Railway project → **Deploy from GitHub repo**.
3. Add a **PostgreSQL** plugin to the project — Railway injects `DATABASE_URL` automatically.
4. Railway uses Nixpacks to detect Rust and build automatically.
5. Migrations run on every startup via `sqlx::migrate!()`.

See `railway.toml` at the repo root for build/deploy configuration.

### Docker Compose (local full-stack)

```bash
# Start Postgres + cord-service
docker compose -f docker-compose.dev.yml up -d

# Tail service logs
docker compose -f docker-compose.dev.yml logs -f cord-service
```

### Docker (standalone)
```dockerfile
FROM rust:1.75-slim as builder
WORKDIR /app
COPY . .
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y libssl3 ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/target/release/cord-service .
EXPOSE 3001
CMD ["./cord-service"]
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests for new functionality
5. Run tests (`cargo test`)
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

## 📈 Roadmap

### Phase 1: Core Features ✅
- [x] User management API
- [x] Social feed endpoints
- [x] Token metadata management
- [x] Search functionality
- [x] Basic analytics

### Phase 2: Enhanced Features 🚧
- [x] PostgreSQL with versioned migrations
- [ ] JWT authentication middleware
- [ ] Real-time notifications (WebSocket)
- [ ] File upload for avatars/media
- [ ] Rate limiting and security

### Phase 3: Advanced Features 📅
- [ ] Redis caching layer
- [ ] Advanced analytics and metrics
- [ ] Admin panel API
- [ ] Backup and recovery
- [ ] Monitoring and health checks

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.

---

<div align="center">
Built with ❤️ in Rust for the Cord community 🚀
</div>
