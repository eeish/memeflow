# CLAUDE.md

## Product Overview

Cord is a **decentralized Social-Fi platform** on Sui where content creation is directly tied to financial upside. Creators post content, supporters buy into creators they believe in, and economic alignment drives the whole system.

**Onboarding:** Users log in via Slush Wallet or zkLogin, then set a username. All on-chain complexity is hidden behind this flow.

### Social-Fi Mechanism — Two Phases

#### Phase 1: Share Market
- Users post content to the **Plaza** (global feed).
- Other users can **buy shares** in any creator. Price follows a bonding curve — early supporters pay less, price rises with demand.
- Holding shares = access to the creator's **private domain** (exclusive content, private comments).
- The bonding curve incentivizes creators to produce better content (more demand → higher share price → creator benefits).
- Liquidity from share purchases accumulates in the bonding curve pool.

#### Phase 2: Token Graduation
- When a creator's shares sold reach a threshold (e.g. 50), the accumulated liquidity is used to **mint a creator-specific token**.
- Existing share holders are converted to token holders.
- The token is freely tradeable — other users discover it through the creator's content in the Plaza.
- Token appreciation = creator income from content creation.
- Token holders retain private domain access.

**Key insight:** Shares (Phase 1) and tokens (Phase 2) both function as an **entrance ticket to the private domain**. The transition from shares to tokens unlocks broader liquidity and price discovery while preserving the core economic alignment between creators and supporters.

### Design Principles

1. **Simplicity over features** - Hide blockchain complexity. Minimize options. If a feature requires explanation, simplify it or cut it.

2. **Creator-first UX** - Target audience is crypto-native creators. They understand wallets and transactions, but don't want friction. Optimize flows for posting, engaging, and managing their share market.

3. **Economic alignment** - The share/token market creates real stakes. Holders benefit when creators succeed. Design should reinforce this relationship at every layer.

4. **Verifiable but not verbose** - On-chain attestations provide proof, but don't clutter the UI with hashes and transaction IDs. Make verification accessible, not prominent.

### Core Features
- **Plaza** - Global feed of all posts
- **Share Market** (Phase 1) - Buy/sell shares in creators (bonding curve pricing)
- **Token Graduation** (Phase 2) - Shares → tradeable creator token when threshold is met
- **Private Domain** - Exclusive content/comments for share/token holders
- **Post Attestation** - On-chain proof that content existed at a specific time

## Development Commands

### Frontend
- `npm run dev` - Start dev server (React 19 + Vite, port 5173)
- `npm run build` - Production build
- `npm run typecheck` - TypeScript validation
- `npm run lint` / `npm run format` - Linting and formatting

### The Ranker (Rust Backend)
- `npm run service:start` - Start service (Axum, port 3001)
- `cd service && cargo test` - Run tests
- `npm run service:reset` - Reset database

### Smart Contracts (Sui Move)
- `npm run contract:build` - Build contracts
- `npm run contract:deploy:devnet` - Deploy to devnet
- `npm run contract:fmt` - Format Move code

### Dev Utility
- `./dev.sh start` - Start frontend + backend
- `./dev.sh stop` - Stop all services
- `./dev.sh reset` - Reset database and restart

## Architecture

Cord is a **decentralized social platform** with three layers:

### 1. Frontend (React 19 + TypeScript + Vite)
- Social feed, user profiles, token dashboard
- Sui wallet integration via @mysten/dapp-kit
- shadcn/ui components with glass morphism design

### 2. The Ranker (Rust + Axum)
Responsible for indexing and ranking decentralized data:
- RESTful API on port 3001
- SQLite database for user profiles, posts, follows
- Post hash verification (matches on-chain attestations)
- R2 media uploads
- Sui address verification

Key modules:
- `handlers.rs` - API endpoints (plaza, users, posts, feed, follows)
- `database.rs` - Data persistence
- `post_hash.rs` - SHA256 hash computation for post attestation
- `profile_validation.rs`, `username_validation.rs` - Input validation

### 3. Smart Contracts (Sui Move)

**`post.move`** - Post Attestation
- Emits hash-based proof-of-existence for off-chain posts
- Hash: SHA256(author || timestamp_ms || content)
- Posts stored off-chain, immutable attestation on-chain

**`share_market.move`** - Share Market (Phase 1)
- Bonding curve: `p(x) = 0.02 + 0.35/(x+3) + 1/(38-x)` SUI
- Max 30 holders per creator, 1 share per wallet
- Creator must buy first share at market creation
- Accumulated liquidity funds token graduation in Phase 2

## Key Files
- `src/App.tsx` - Main app with routing
- `src/components/SocialFeed.tsx` - Feed interface
- `src/components/Plaza.tsx` - Global plaza view
- `src/lib/config.ts` - Network configuration
- `service/src/main.rs` - Server setup and routes
- `contracts/cord/sources/` - Move contracts
- `public/deployment-*.json` - Deployed contract addresses

## Notes
- Frontend (5173) and backend (3001) run independently
- Wallet must match deployed contract network (devnet)
- Service logs: `logs/backend.log`, `logs/frontend.log`
