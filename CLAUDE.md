# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Start development server**: `npm run dev` (runs Vite dev server with HMR)
- **Build for production**: `npm run build` (compiles TypeScript and builds with Vite)
- **Lint code**: `npm run lint` (runs ESLint on all files)
- **Preview production build**: `npm run preview` (serves built files locally)

## Project Architecture

This is a React + TypeScript + Vite application with the following key characteristics:

### Tech Stack
- **Frontend Framework**: React 19 with TypeScript
- **Build Tool**: Vite 7 with React plugin
- **Blockchain Integration**: Mysten Labs Sui ecosystem (@mysten/dapp-kit, @mysten/sui)
- **State Management**: React Query (@tanstack/react-query) for server state
- **UI Components**: Radix UI with shadcn/ui component library
- **Styling**: Tailwind CSS with custom design system
- **Linting**: ESLint with TypeScript support and React-specific rules

### Key Dependencies
- `@mysten/dapp-kit` and `@mysten/sui`: Sui blockchain integration toolkit
- `@tanstack/react-query`: For asynchronous state management and data fetching
- `@radix-ui/*`: Headless UI component primitives
- `tailwindcss`: Utility-first CSS framework
- `lucide-react`: Beautiful & consistent icon library
- `class-variance-authority`: For component variant management
- Standard React 19 ecosystem with modern TypeScript support

### Project Structure
- `src/App.tsx`: Main application component with unified UI
- `src/main.tsx`: Application entry point with React root setup
- `src/components/`: React components including TodoApp and UI library
  - `ui/`: Comprehensive shadcn/ui component library (Button, Card, Input, etc.)
  - `TodoApp.tsx`: Blockchain todo application component
- `src/lib/utils.ts`: Shared utility functions for component styling
- `contracts/`: Move language smart contracts for Sui blockchain
- `tailwind.config.js` & `postcss.config.js`: Styling configuration
- Standard Vite project structure with public assets in `/public`

### TypeScript Configuration
- Uses TypeScript 5.8 with project references
- Separate configs for app (`tsconfig.app.json`) and Node (`tsconfig.node.json`)
- ESLint configured with TypeScript-aware rules

### Development Notes
- **MemeFlow Social Trading Platform**: A comprehensive social platform for meme token trading
- **Authentication System**: Mock authentication with localStorage persistence
- **Social Features**: Real-time social feed, token dashboard, user profiles, search, and notifications
- **Modern Architecture**: Uses React patterns, hooks, context providers, and component composition
- **Blockchain Ready**: Sui integration maintained for future token trading features
- **Responsive Design**: Mobile-first approach with Tailwind CSS and glass morphism effects