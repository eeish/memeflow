# Cord - Social Token Trading Platform

A comprehensive social trading platform built on React 19 and TypeScript, designed for meme token communities and social finance.

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)](https://github.com/your-username/cord)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-blue.svg)](https://reactjs.org/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-3.4-38B2AC.svg)](https://tailwindcss.com/)

## ✨ Features

### 🎭 Social Trading Platform
- **Username → Token**: Automatic token creation for each user
- **Social Feed**: Real-time posts, likes, comments, and token mentions
- **Token Market**: Live token dashboard with pricing, holders, and market data
- **Search & Discovery**: Find tokens, users, and trending hashtags

### 👤 User Experience
- **Wallet Integration**: Sui wallet connection with address verification
- **New User Detection**: Prevents duplicate accounts per wallet address
- **Profile Management**: Personal profiles with token portfolios and social stats
- **Notifications**: Real-time activity feed with categorized updates
- **Authentication**: Secure sign-up/sign-in with persistent sessions
- **Responsive Design**: Mobile-first approach with glass morphism UI

### ⚡ Modern Tech Stack
- **Frontend**: React 19 + TypeScript + Vite
- **Backend**: Rust + Axum web framework for high-performance API
- **UI Components**: Comprehensive shadcn/ui library with 40+ components
- **Styling**: Tailwind CSS with custom design system and animations
- **Database**: SQLite (dev) / PostgreSQL (prod) with SQLx
- **Blockchain Ready**: Sui Network integration for future token trading

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Git

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/cord.git
cd cord

# Install dependencies
npm install

# Start development server
npm run dev
```

Visit [http://localhost:5173](http://localhost:5173) to see the application.

## 🛠 Development Commands

```bash
# Development
npm run dev          # Start development server with HMR
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Run ESLint
npm run typecheck    # Run TypeScript checks

# Backend Service (Rust)
cd service && cargo run   # Start Rust API server on :3001
cd service && cargo test  # Run service tests

# Blockchain (Future)
npm run contract:build    # Build Move smart contracts
npm run contract:test     # Test smart contracts
npm run deploy:testnet    # Deploy to Sui testnet
```

## 📁 Project Structure

```
cord/
├── src/
│   ├── components/           # React components
│   │   ├── ui/              # shadcn/ui component library
│   │   ├── AuthProvider.tsx # Authentication system
│   │   ├── SocialFeed.tsx   # Main social feed
│   │   ├── TokenDashboard.tsx # Token market interface
│   │   ├── Profile.tsx      # User profiles
│   │   ├── SearchPage.tsx   # Search functionality
│   │   └── Notifications.tsx # Activity notifications
│   ├── lib/                 # Utility functions
│   ├── App.tsx              # Main application component
│   ├── main.tsx             # Application entry point
│   └── index.css            # Global styles with design system
├── contracts/               # Sui Move smart contracts (future)
├── service/                 # Rust backend service
│   ├── src/                # Rust source code
│   │   ├── main.rs         # Web server and routing
│   │   ├── models.rs       # Data structures
│   │   ├── handlers.rs     # API endpoints
│   │   └── database.rs     # Database operations
│   ├── Cargo.toml          # Rust dependencies
│   └── README.md           # Service documentation
├── public/                  # Static assets
├── tailwind.config.js       # Tailwind CSS configuration
├── vite.config.ts          # Vite configuration
└── package.json            # Dependencies and scripts
```

## 🎨 Design System

### Color Palette
- **Cyber Pink**: `#ff0080` - Primary brand color
- **Electric Blue**: `#00ffff` - Accent and highlights  
- **Neon Green**: `#39ff14` - Success states
- **Holographic Purple**: `#8a2be2` - Secondary actions
- **Void Black**: `#0a0a0f` - Background base

### Components
- **Glass Morphism**: Translucent cards with backdrop blur
- **Gradient Animations**: Dynamic holographic effects
- **Floating Elements**: Subtle animations and hover states
- **Responsive Grid**: Mobile-first responsive layouts

## 🔧 Configuration

### Environment Variables
Create a `.env.local` file in the root directory:

```env
# Application
VITE_APP_NAME=Cord
VITE_APP_VERSION=1.0.0

# Network Configuration (Future Blockchain Integration)
VITE_NETWORK=testnet
VITE_PACKAGE_ID=YOUR_PACKAGE_ID_HERE
VITE_TESTNET_RPC=https://fullnode.testnet.sui.io:443
VITE_LOCAL_RPC=http://127.0.0.1:9000

# API Configuration (Future)
VITE_API_BASE_URL=https://api.cord.io
```

## 🧪 Testing

```bash
# Run all tests
npm run test

# Type checking
npm run typecheck

# Linting
npm run lint

# Build verification
npm run build
```

## 🚀 Deployment

### Vercel (Recommended)
1. Fork this repository
2. Connect to Vercel
3. Deploy automatically on push

### Manual Build
```bash
npm run build
# Deploy the `dist/` folder to your hosting provider
```

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 5173
CMD ["npm", "run", "preview"]
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Use TypeScript for all new code
- Follow existing component patterns
- Add proper error handling
- Write descriptive commit messages
- Test on mobile devices

## 🛣 Roadmap

### Phase 1: Core Platform ✅
- [x] User authentication system
- [x] Social feed with posts and interactions
- [x] Token dashboard and market data
- [x] User profiles and search functionality
- [x] Notification system

### Phase 2: Blockchain Integration 🚧
- [ ] Sui wallet connection
- [ ] Real token creation and trading
- [ ] Smart contract deployment
- [ ] On-chain social interactions
- [ ] Token holder rewards

### Phase 3: Advanced Features 📅
- [ ] Real-time chat and messaging
- [ ] Advanced token analytics
- [ ] Mobile app development
- [ ] Cross-chain compatibility
- [ ] NFT integration

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Sui Foundation](https://sui.io/) - Blockchain platform
- [Mysten Labs](https://mystenlabs.com/) - Development tools
- [shadcn/ui](https://ui.shadcn.com/) - UI component library
- [Tailwind CSS](https://tailwindcss.com/) - Styling framework
- [Lucide React](https://lucide.dev/) - Icon library

## 📞 Support

- Create an [Issue](https://github.com/your-username/cord/issues)
- Join our [Discord](https://discord.gg/cord)
- Follow us on [Twitter](https://twitter.com/cord)

---

<div align="center">
Made with ❤️ for the meme community 🚀
</div>