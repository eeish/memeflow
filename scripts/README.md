# MemeFlow Scripts

This directory contains scripts for deploying and managing MemeFlow smart contracts and services.

## Database Management

### 🐍 **reset_database.py** (Python Script - Recommended)
Comprehensive Python-based database reset utility with advanced features.

```bash
python3 scripts/reset_database.py [options]

Options:
  --help, -h          Show help message
  --check             Check current database and service state
  --sql-only          Generate SQL reset script only
  --no-restart        Reset database without restarting service
  --force             Force kill processes without confirmation
  --verbose, -v       Enable verbose logging
```

**Examples:**
```bash
python3 scripts/reset_database.py                    # Full reset + restart service
python3 scripts/reset_database.py --check           # Check current state
python3 scripts/reset_database.py --sql-only        # Generate SQL script
python3 scripts/reset_database.py --no-restart      # Only reset database
python3 scripts/reset_database.py --force --verbose # Force with verbose logging
```

**Features:**
- ✅ **Smart Detection**: Automatically detects SQLite file vs in-memory database
- ✅ **Safe SQL Reset**: Preserves schema while truncating data
- ✅ **Process Management**: Graceful shutdown with fallback to force kill
- ✅ **Service Health Checks**: Verifies service startup and API availability
- ✅ **Comprehensive Logging**: Color-coded output with verbose mode
- ✅ **Error Recovery**: Multiple fallback strategies for database reset

## Contract Deployment Scripts

- **`deploy-optimized.js`** - Main deployment script with optimizations, backup/restore, and configuration management
- **`test-deployment.js`** - Test deployed contracts and verify functionality

## Testing & Development Scripts

- **`start-local-network.js`** - Start local Sui network for development

## Quick Development Workflow

```bash
# 1. Start development environment
npm run dev                                    # Start frontend
python3 scripts/reset_database.py --check     # Check backend status

# 2. Reset database when needed
python3 scripts/reset_database.py             # Full reset with restart

# 3. Generate SQL for debugging
python3 scripts/reset_database.py --sql-only > reset.sql
```

## Configuration

Scripts read configuration from:
- `../public/deployment-*.json` files
- Environment variables  
- Command line arguments

Check individual scripts for specific options and usage.

## Migration Notes

**⚠️ Old database reset scripts have been removed and replaced with Python:**
- ~~`reset-database.js`~~ → Use `reset_database.py`
- ~~`reset-db.sh`~~ → Use `reset_database.py`  
- ~~`service/src/bin/reset_db.rs`~~ → Use `reset_database.py`

The new Python script provides all functionality with improved reliability, error handling, and comprehensive features.

## Troubleshooting

### Service issues
```bash
# Check current state
python3 scripts/reset_database.py --check

# Full reset with verbose logging
python3 scripts/reset_database.py --force --verbose
```

### Permission denied
```bash
# Make Python script executable
chmod +x scripts/reset_database.py
```

This Python-based solution provides a more robust and maintainable approach to database management! 🐍