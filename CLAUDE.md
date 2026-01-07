# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Frontend Development
- **Start dev server**: `npm run dev` (React 19 + Vite on port 5173, binds to 0.0.0.0)
- **Build for production**: `npm run build` (runs TypeScript compilation then Vite build)
- **Type checking**: `npm run typecheck` (TypeScript validation without emit)
- **Linting**: `npm run lint` (ESLint with React hooks and TypeScript rules)
- **Formatting**: `npm run format` (Prettier write) / `npm run format:check` (check only)

### Backend Service (Rust)
- **Start service**: `npm run service:start` or `cd service && RUST_LOG=info cargo run --bin memeflow-service` (Axum server on port 3001)
- **Test service**: `cd service && cargo test` (run Rust tests)
- **Reset database**: `npm run service:reset` or `cd service && cargo run --bin reset_db`

### Smart Contracts (Sui Move)
- **Build contracts**: `npm run contract:build` (builds contracts/memeflow)
- **Format Move code**: `npm run contract:fmt` (sui move fmt)
- **Deploy to devnet**: `npm run contract:deploy:devnet` (default deployment target)
- **Deploy to testnet**: `npm run contract:deploy:testnet`
- **Deploy to local**: `npm run contract:deploy:local` (requires local Sui network)
- **Test deployment**: `npm run contract:test:devnet` (verify deployed contracts)
- **Verify deployment**: `npm run contract:verify:devnet`
- **Clean builds**: `npm run contract:clean` (removes all build artifacts)

### Development Utility Script
The `./dev.sh` script provides orchestrated development operations:
- `./dev.sh start` - Start both frontend (5173) and backend (3001) services
- `./dev.sh stop` - Stop all services
- `./dev.sh status` - Check service status and ports
- `./dev.sh logs [backend|frontend|both]` - View service logs
- `./dev.sh reset` - Reset database and restart backend
- `./dev.sh clean` - Clean all artifacts and reset database
- `./dev.sh test` - Run typecheck, lint, and build

### Database Management
Use Python script for comprehensive database operations:
- `python3 scripts/reset_database.py` - Full database reset with service restart
- `python3 scripts/reset_database.py --check` - Check database and service state
- `python3 scripts/reset_database.py --sql-only` - Generate SQL reset script
- `python3 scripts/reset_database.py --no-restart` - Reset database without restart
- `python3 scripts/reset_database.py --force --verbose` - Force reset with logging

### Testing & Validation
- **Full test suite**: `npm run test` (contract tests + typecheck + lint)
- **CI pipeline**: `npm run ci` (test + build)

## Project Architecture

### Multi-Service Platform
MemeFlow is a **social token trading platform** with three interconnected layers:

1. **Frontend (React 19 + TypeScript + Vite)**
   - Comprehensive social feed, token dashboard, user profiles, search, notifications
   - shadcn/ui component library (40+ components in `src/components/ui/`)
   - Sui wallet integration via @mysten/dapp-kit for blockchain interactions
   - Glass morphism design system with custom Tailwind configuration

2. **Backend Service (Rust + Axum)**
   - RESTful API on port 3001 handling non-blockchain operations
   - SQLite (dev) / PostgreSQL (prod) with SQLx for data persistence
   - User management, social feed, token metadata, analytics, notifications
   - Sui address verification with on-chain balance/transaction queries
   - CORS configured for frontend integration

3. **Smart Contracts (Sui Move)**
   - `social_follow.move` - Friend.tech-style bonding curve (S²/16000 SUI) for social follows, 7 free follows
   - `memeflow_social.move` - Integration layer connecting profiles to social features
   - Token trading contracts (`meme_token_factory.move`, `amm_pool.move`) are implemented but not yet integrated

### Key Files & Directories
- **`src/App.tsx`** - Main application component with routing and layout
- **`src/main.tsx`** - Entry point with QueryClientProvider and Sui providers
- **`src/components/AuthProvider.tsx`** - Mock authentication with localStorage persistence
- **`src/components/SocialFeed.tsx`** - Main social feed interface
- **`src/components/TokenDashboard.tsx`** - Token market and trading interface
- **`src/components/Profile.tsx`** - User profile with blockchain integration
- **`src/components/Plaza.tsx`** - Plaza/market view component
- **`src/lib/config.ts`** - Network and deployment configuration
- **`service/src/main.rs`** - Axum server setup, routing, and CORS
- **`service/src/handlers.rs`** - API endpoint implementations
- **`service/src/database.rs`** - Database operations and schema
- **`contracts/memeflow/sources/`** - Sui Move smart contracts
- **`public/deployment-*.json`** - Deployment addresses per network (devnet/testnet/mainnet)

### Current Deployment State
- **Active Network**: Devnet only
- **Package ID**: `0x5e60863e57204f2a2635fe799ab4e5b792ba6d487d1eaf723abecfa7ee49a19f`
- **Active Features**: Social following with bonding curve, user profiles
- **Pending Integration**: Token creation and AMM trading contracts

### Architecture Patterns
- **Frontend**: Functional React components with hooks, React Query for server state, Context providers for auth/wallet
- **Component Library**: shadcn/ui headless primitives with Radix UI, class-variance-authority for variants
- **Backend**: Axum router with handler modules, SQLx for compile-time SQL verification
- **Blockchain**: Move modules with shared objects for social graph, bonding curve pricing model
- **Network Configuration**: Environment variables control network selection (devnet/testnet/mainnet), deployment configs loaded from public JSON files

### Design System
Custom Tailwind configuration with cyber/neon aesthetic:
- **Cyber Pink** (#ff0080), **Electric Blue** (#00ffff), **Neon Green** (#39ff14)
- Glass morphism cards with backdrop blur and gradient borders
- Mobile-first responsive grid with breakpoint consistency

### Development Workflow Notes
- Frontend and backend run independently on different ports (5173, 3001)
- Use `./dev.sh start` to launch both services concurrently
- Database resets require backend restart - use Python script or `./dev.sh reset`
- Smart contract deployment updates `public/deployment-{network}.json` which frontend reads
- Wallet must be on same network (devnet) as deployed contracts to avoid package ID errors
- Service logs written to `logs/backend.log` and `logs/frontend.log` when using dev.sh

### TypeScript & Build Configuration
- Project references: separate tsconfig for app and Node scripts
- Vite plugin-react for Fast Refresh with Babel transforms
- ESLint with typescript-eslint parser and react-hooks plugin
- Server binds to 0.0.0.0 for remote development access (vite.config.ts)
- Uncaught Error: useNetwork must be used within a NetworkProvider
    at useNetwork (NetworkContext.tsx:98:11)
    at AuthProvider (AuthProvider.tsx:49:29)