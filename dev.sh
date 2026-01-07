#!/bin/bash

# MemeFlow Development Utility Script
# This script provides common development operations

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Function to print colored output
print_header() {
    echo -e "${PURPLE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${PURPLE}🚀 MemeFlow Development Utility${NC}"
    echo -e "${PURPLE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

print_status() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_cyan() {
    echo -e "${CYAN}🔧 $1${NC}"
}

# Function to show help
show_help() {
    print_header
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  start              Start both frontend and backend services"
    echo "  frontend           Start only frontend (Vite dev server)"
    echo "  backend            Start only backend (Rust service)"
    echo "  build              Build frontend and backend"
    echo "  test               Run all tests (typecheck, lint, build)"
    echo "  reset              Reset database and restart backend"
    echo "  reset-quick        Quick database reset using bash script"
    echo "  logs               Show backend service logs"
    echo "  status             Check status of all services"
    echo "  stop               Stop all running services"
    echo "  clean              Clean build artifacts and reset database"
    echo ""
    echo "Database Commands:"
    echo "  db:reset           Reset database (Node.js script)"
    echo "  db:quick           Quick database reset (Bash script)"
    echo "  db:sql             Generate SQLite reset script"
    echo "  db:check           Check database state (Rust binary)"
    echo ""
    echo "Development Commands:"
    echo "  lint               Run ESLint"
    echo "  typecheck          Run TypeScript type checking"
    echo "  format             Format code with Prettier"
    echo "  contracts          Build Sui smart contracts"
    echo ""
    echo "Examples:"
    echo "  $0 start           # Start full development environment"
    echo "  $0 reset           # Reset database and restart"
    echo "  $0 test            # Run all tests"
    echo "  $0 clean           # Clean everything and start fresh"
}

# Function to check if port is in use
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null ; then
        return 0
    else
        return 1
    fi
}

# Function to start services
start_services() {
    print_header
    print_status "Starting MemeFlow development environment..."
    
    # Start backend
    print_cyan "Starting backend service (Rust + Axum)..."
    if check_port 3001; then
        print_warning "Backend already running on port 3001"
    else
        cd service
        RUST_LOG=info cargo run --bin memeflow-service > ../logs/backend.log 2>&1 &
        BACKEND_PID=$!
        echo $BACKEND_PID > ../logs/backend.pid
        cd ..
        
        # Wait for backend to start
        sleep 3
        if check_port 3001; then
            print_success "Backend started (PID: $BACKEND_PID)"
        else
            print_error "Backend failed to start"
            return 1
        fi
    fi
    
    # Start frontend
    print_cyan "Starting frontend service (React + Vite)..."
    if check_port 5173; then
        print_warning "Frontend already running on port 5173"
    else
        # Bind dev server to all interfaces for remote access
        npm run dev -- --host 0.0.0.0 > logs/frontend.log 2>&1 &
        FRONTEND_PID=$!
        echo $FRONTEND_PID > logs/frontend.pid
        
        sleep 2
        if check_port 5173; then
            print_success "Frontend started (PID: $FRONTEND_PID)"
        else
            print_error "Frontend failed to start"
            return 1
        fi
    fi
    
    echo ""
    print_success "🎉 MemeFlow development environment is running!"
    echo ""
    print_cyan "Frontend: http://localhost:5173"
    print_cyan "Backend:  http://localhost:3001"
    print_cyan "API Docs: http://localhost:3001/health"
    echo ""
    print_status "Use '$0 logs' to view logs"
    print_status "Use '$0 stop' to stop services"
    print_status "Use '$0 reset' to reset database"
}

# Function to stop services
stop_services() {
    print_header
    print_status "Stopping MemeFlow services..."
    
    # Stop frontend
    if [ -f "logs/frontend.pid" ]; then
        FRONTEND_PID=$(cat logs/frontend.pid)
        if kill $FRONTEND_PID 2>/dev/null; then
            print_success "Frontend stopped (PID: $FRONTEND_PID)"
        fi
        rm -f logs/frontend.pid
    fi
    
    # Stop backend
    if [ -f "logs/backend.pid" ]; then
        BACKEND_PID=$(cat logs/backend.pid)
        if kill $BACKEND_PID 2>/dev/null; then
            print_success "Backend stopped (PID: $BACKEND_PID)"
        fi
        rm -f logs/backend.pid
    fi
    
    # Kill any remaining processes on ports
    if check_port 3001; then
        print_status "Killing remaining processes on port 3001..."
        lsof -ti:3001 | xargs kill -TERM 2>/dev/null || true
    fi
    
    if check_port 5173; then
        print_status "Killing remaining processes on port 5173..."
        lsof -ti:5173 | xargs kill -TERM 2>/dev/null || true
    fi
    
    print_success "All services stopped"
}

# Function to show status
show_status() {
    print_header
    print_status "MemeFlow Service Status"
    echo ""
    
    # Backend status
    if check_port 3001; then
        print_success "Backend: Running on port 3001"
    else
        print_error "Backend: Not running"
    fi
    
    # Frontend status  
    if check_port 5173; then
        print_success "Frontend: Running on port 5173"
    else
        print_error "Frontend: Not running"
    fi
    
    # Database status
    if [ -f "service/memeflow.db" ]; then
        SIZE=$(ls -lh service/memeflow.db | awk '{print $5}')
        print_success "Database: SQLite file exists ($SIZE)"
    else
        print_status "Database: In-memory (no persistent file)"
    fi
    
    # Check if processes are tracked
    echo ""
    if [ -f "logs/backend.pid" ]; then
        BACKEND_PID=$(cat logs/backend.pid)
        print_status "Tracked backend PID: $BACKEND_PID"
    fi
    
    if [ -f "logs/frontend.pid" ]; then
        FRONTEND_PID=$(cat logs/frontend.pid)
        print_status "Tracked frontend PID: $FRONTEND_PID"
    fi
}

# Function to show logs
show_logs() {
    print_header
    
    case "${2:-both}" in
        backend)
            print_cyan "Backend Logs (last 20 lines):"
            echo "════════════════════════════════"
            if [ -f "logs/backend.log" ]; then
                tail -20 logs/backend.log
            else
                print_warning "No backend log file found"
            fi
            ;;
        frontend)
            print_cyan "Frontend Logs (last 20 lines):"
            echo "═══════════════════════════════"
            if [ -f "logs/frontend.log" ]; then
                tail -20 logs/frontend.log
            else
                print_warning "No frontend log file found"
            fi
            ;;
        both|*)
            print_cyan "Backend Logs (last 10 lines):"
            echo "════════════════════════════════"
            if [ -f "logs/backend.log" ]; then
                tail -10 logs/backend.log
            else
                print_warning "No backend log file found"
            fi
            
            echo ""
            print_cyan "Frontend Logs (last 10 lines):"
            echo "═══════════════════════════════"
            if [ -f "logs/frontend.log" ]; then
                tail -10 logs/frontend.log
            else
                print_warning "No frontend log file found"
            fi
            ;;
    esac
}

# Function to clean everything
clean_all() {
    print_header
    print_status "Cleaning MemeFlow development environment..."
    
    # Stop services
    stop_services
    
    # Clean build artifacts
    print_status "Cleaning build artifacts..."
    rm -rf dist/
    rm -rf service/target/debug
    rm -rf logs/*.log
    rm -rf logs/*.pid
    
    # Reset database
    print_status "Resetting database..."
    ./scripts/reset-db.sh --no-restart
    
    print_success "Environment cleaned!"
    print_status "Use '$0 start' to begin fresh development"
}

# Create logs directory if it doesn't exist
mkdir -p logs

# Main command handling
case "${1:-help}" in
    help|--help|-h)
        show_help
        ;;
    start)
        start_services
        ;;
    frontend)
        print_header
        print_cyan "Starting frontend only..."
        npm run dev -- --host 0.0.0.0
        ;;
    backend)
        print_header
        print_cyan "Starting backend only..."
        cd service && RUST_LOG=info cargo run --bin memeflow-service
        ;;
    build)
        print_header
        print_cyan "Building frontend..."
        npm run build
        print_cyan "Building backend..."
        cd service && cargo build
        print_success "Build completed!"
        ;;
    test)
        print_header
        print_cyan "Running TypeScript check..."
        npm run typecheck
        print_cyan "Running ESLint..."
        npm run lint
        print_cyan "Running build test..."
        npm run build
        print_success "All tests passed!"
        ;;
    reset)
        print_header
        npm run db:reset
        ;;
    reset-quick)
        print_header
        npm run db:reset-quick
        ;;
    logs)
        show_logs "$@"
        ;;
    status)
        show_status
        ;;
    stop)
        stop_services
        ;;
    clean)
        clean_all
        ;;
    db:reset)
        npm run db:reset
        ;;
    db:quick)
        npm run db:reset-quick
        ;;
    db:sql)
        npm run db:sql
        ;;
    db:check)
        npm run service:check
        ;;
    lint)
        npm run lint
        ;;
    typecheck)
        npm run typecheck
        ;;
    format)
        npm run format
        ;;
    contracts)
        npm run contract:build
        ;;
    *)
        print_error "Unknown command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac
