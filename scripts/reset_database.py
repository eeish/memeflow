#!/usr/bin/env python3
"""
Cord Database Reset Utility

This script provides comprehensive database management for Cord development.
It handles both SQLite file-based and in-memory databases, with service management.

Usage:
    python reset_database.py [options]

Options:
    --help, -h          Show this help message
    --check             Check current database and service state
    --sql-only          Generate SQL reset script only
    --no-restart        Reset database without restarting service
    --force             Force kill processes without confirmation
    --verbose, -v       Enable verbose logging
    
Examples:
    python reset_database.py                    # Full reset with service restart
    python reset_database.py --check           # Check current state
    python reset_database.py --sql-only        # Generate SQL script
    python reset_database.py --no-restart      # Reset DB only
"""

import argparse
import os
import sqlite3
import subprocess
import sys
import time
import signal
import requests
from pathlib import Path
from typing import Optional, List

class Colors:
    """ANSI color codes for terminal output"""
    RED = '\033[0;31m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    BLUE = '\033[0;34m'
    PURPLE = '\033[0;35m'
    CYAN = '\033[0;36m'
    WHITE = '\033[1;37m'
    NC = '\033[0m'  # No Color

class DatabaseManager:
    """Manages Cord database operations"""
    
    def __init__(self, verbose: bool = False):
        self.verbose = verbose
        self.script_dir = Path(__file__).parent
        self.service_dir = self.script_dir.parent / "service"
        self.port = 3001
        self.service_url = f"http://localhost:{self.port}"
        
        # Multiple potential database locations
        self.potential_db_paths = [
            self.service_dir / "db" / "cord.db",        # ./db/cord.db (old config)
            self.service_dir / "db" / "test.db",            # ./db/test.db (found existing)
            self.service_dir / "cord.db",               # ./cord.db (current config)
            self.script_dir.parent / "db" / "cord.db",  # ../db/cord.db
            self.script_dir.parent / "cord.db",         # ../cord.db
        ]
        
        # Find the actual database file
        self.database_path = self.find_database_file()
        
    def find_database_file(self) -> Optional[Path]:
        """Find the actual SQLite database file from potential locations"""
        for db_path in self.potential_db_paths:
            if db_path.exists() and db_path.is_file():
                self.verbose_log(f"Found database file: {db_path}")
                return db_path
                
        self.verbose_log("No database file found in any expected location")
        # Return the most likely default path for creation
        return self.service_dir / "cord.db"
        
    def log(self, message: str, color: str = Colors.NC):
        """Print colored log message"""
        print(f"{color}{message}{Colors.NC}")
        
    def verbose_log(self, message: str):
        """Print message only in verbose mode"""
        if self.verbose:
            self.log(f"🔍 {message}", Colors.CYAN)
            
    def log_success(self, message: str):
        """Print success message"""
        self.log(f"✅ {message}", Colors.GREEN)
        
    def log_warning(self, message: str):
        """Print warning message"""
        self.log(f"⚠️  {message}", Colors.YELLOW)
        
    def log_error(self, message: str):
        """Print error message"""
        self.log(f"❌ {message}", Colors.RED)
        
    def log_info(self, message: str):
        """Print info message"""
        self.log(f"ℹ️  {message}", Colors.BLUE)
        
    def find_service_processes(self) -> List[int]:
        """Find processes using the service port"""
        try:
            result = subprocess.run(
                ["lsof", "-ti", f":{self.port}"],
                capture_output=True,
                text=True,
                check=False
            )
            
            if result.stdout.strip():
                pids = [int(pid.strip()) for pid in result.stdout.strip().split('\n') if pid.strip()]
                self.verbose_log(f"Found {len(pids)} process(es) using port {self.port}")
                return pids
            else:
                self.verbose_log(f"No processes found using port {self.port}")
                return []
                
        except Exception as e:
            self.verbose_log(f"Error checking processes: {e}")
            return []
    
    def kill_service_processes(self, force: bool = False) -> bool:
        """Kill service processes"""
        pids = self.find_service_processes()
        
        if not pids:
            self.log_info("No service processes to stop")
            return True
            
        self.log_info(f"Stopping {len(pids)} service process(es)...")
        
        killed_count = 0
        for pid in pids:
            try:
                # Try graceful termination first
                os.kill(pid, signal.SIGTERM)
                self.log_success(f"Sent SIGTERM to process {pid}")
                killed_count += 1
            except ProcessLookupError:
                self.verbose_log(f"Process {pid} already stopped")
            except PermissionError:
                self.log_warning(f"No permission to kill process {pid}")
            except Exception as e:
                self.log_warning(f"Failed to terminate process {pid}: {e}")
        
        if killed_count > 0:
            self.log_info("Waiting for graceful shutdown...")
            time.sleep(2)
            
            # Check for remaining processes and force kill if needed
            remaining_pids = self.find_service_processes()
            if remaining_pids and force:
                self.log_warning("Force killing remaining processes...")
                for pid in remaining_pids:
                    try:
                        os.kill(pid, signal.SIGKILL)
                        self.log_success(f"Force killed process {pid}")
                    except Exception as e:
                        self.log_warning(f"Failed to force kill process {pid}: {e}")
        
        return len(self.find_service_processes()) == 0
    
    def check_service_status(self) -> bool:
        """Check if service is running and responding"""
        try:
            response = requests.get(f"{self.service_url}/health", timeout=5)
            if response.status_code == 200:
                data = response.json()
                if data.get('success'):
                    return True
        except Exception:
            pass
        return False
    
    def check_database_state(self):
        """Check current database and service state"""
        self.log("🔍 Cord Database Status Check", Colors.WHITE)
        self.log("=" * 35, Colors.WHITE)
        print()
        
        # Check all potential database locations
        found_db = None
        for db_path in self.potential_db_paths:
            if db_path.exists() and db_path.is_file():
                if found_db is None:
                    found_db = db_path
                    file_size = db_path.stat().st_size
                    self.log_success(f"✅ Active SQLite database: {db_path}")
                    self.log_info(f"Database file size: {file_size:,} bytes")
                    
                    # Try to connect and get table info
                    try:
                        with sqlite3.connect(db_path) as conn:
                            cursor = conn.cursor()
                            
                            # Get table names
                            cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
                            tables = [row[0] for row in cursor.fetchall()]
                            
                            if tables:
                                self.log_info(f"Tables: {', '.join(tables)}")
                                
                                # Count records in each table
                                for table in tables:
                                    try:
                                        cursor.execute(f"SELECT COUNT(*) FROM {table};")
                                        count = cursor.fetchone()[0]
                                        self.log_info(f"  {table}: {count} records")
                                    except Exception as e:
                                        self.log_warning(f"  {table}: error counting - {e}")
                            else:
                                self.log_warning("No tables found in database")
                                
                    except Exception as e:
                        self.log_warning(f"Could not analyze database: {e}")
                else:
                    self.log_warning(f"⚠️  Additional database file found: {db_path}")
        
        if found_db is None:
            self.log_info("No SQLite database file found in expected locations")
            self.log_info("Expected locations:")
            for db_path in self.potential_db_paths:
                self.log_info(f"  • {db_path}")
            self.log_info("Service likely using in-memory database")
        
        # Check service status
        pids = self.find_service_processes()
        if pids:
            self.log_success(f"Service processes running (PIDs: {', '.join(map(str, pids))})")
            
            if self.check_service_status():
                self.log_success(f"Service responding at {self.service_url}/health")
            else:
                self.log_warning("Service not responding to health checks")
        else:
            self.log_warning("Service is not running")
        
        print()
        
    def generate_sql_reset_script(self) -> str:
        """Generate comprehensive SQL reset script"""
        return """-- Cord SQLite Database Reset Script
-- This script safely truncates all tables while preserving schema
-- Generated by Cord Database Manager

-- Disable foreign key constraints for safe truncation
PRAGMA foreign_keys = OFF;

-- Begin transaction for atomicity
BEGIN TRANSACTION;

-- Truncate all tables in correct order (respecting dependencies)
-- Note: Only delete from tables that exist
DELETE FROM notifications WHERE 1=1;
DELETE FROM likes WHERE 1=1;
DELETE FROM comments WHERE 1=1; 
DELETE FROM posts WHERE 1=1;
DELETE FROM follows WHERE 1=1;
DELETE FROM users WHERE 1=1;

-- Reset auto-increment sequences (if table exists)
DELETE FROM sqlite_sequence WHERE name IN (
    'users', 'posts', 'comments', 'notifications', 'likes', 'follows'
) AND EXISTS (SELECT name FROM sqlite_master WHERE type='table' AND name='sqlite_sequence');

-- Commit the transaction
COMMIT;

-- Re-enable foreign key constraints
PRAGMA foreign_keys = ON;

-- Optimize database (reclaim space and rebuild indexes)
VACUUM;

-- Analyze database for query optimization
ANALYZE;

-- Verify reset by showing table counts
SELECT '=== DATABASE RESET VERIFICATION ===' as status;
SELECT 
    'users' as table_name, COUNT(*) as record_count FROM users
UNION ALL SELECT 'posts', COUNT(*) FROM posts  
UNION ALL SELECT 'comments', COUNT(*) FROM comments
UNION ALL SELECT 'notifications', COUNT(*) FROM notifications
UNION ALL SELECT 'likes', COUNT(*) FROM likes
UNION ALL SELECT 'follows', COUNT(*) FROM follows;

-- Show database metadata
SELECT '=== DATABASE INFO ===' as status;
PRAGMA database_list;
PRAGMA table_list;

-- Show database size after cleanup
SELECT 
    page_count * page_size as size_bytes,
    page_count,
    page_size,
    freelist_count as free_pages
FROM pragma_page_count(), pragma_page_size(), pragma_freelist_count();

SELECT 'Database reset completed successfully!' as status;
"""
    
    def reset_sqlite_database(self) -> bool:
        """Reset SQLite database file"""
        # Find all existing database files to reset
        db_files_to_reset = []
        for db_path in self.potential_db_paths:
            if db_path.exists() and db_path.is_file():
                db_files_to_reset.append(db_path)
        
        if not db_files_to_reset:
            self.log_info("No SQLite database files to reset")
            self.log_info("Expected locations:")
            for db_path in self.potential_db_paths:
                self.log_info(f"  • {db_path}")
            return True
        
        # Reset all found database files
        overall_success = True
        for db_path in db_files_to_reset:
            self.log_info(f"Resetting database: {db_path}")
            
            try:
                # Method 1: Execute SQL reset script (preserves schema)
                sql_script = self.generate_sql_reset_script()
                
                with sqlite3.connect(db_path) as conn:
                    # Enable foreign keys and execute script
                    conn.executescript(sql_script)
                    conn.commit()
                    
                self.log_success(f"Database reset using SQL script: {db_path}")
                
            except Exception as e:
                self.log_warning(f"SQL reset failed for {db_path}: {e}")
                
                # Method 2: Delete database file (fallback)
                try:
                    self.log_info(f"Falling back to file deletion: {db_path}")
                    db_path.unlink()
                    self.log_success(f"Database file deleted: {db_path}")
                    self.log_info("Database will be recreated when service starts")
                    
                except Exception as e2:
                    self.log_error(f"Failed to delete database file {db_path}: {e2}")
                    overall_success = False
        
        return overall_success
    
    def start_service(self) -> bool:
        """Start the service and wait for it to be ready"""
        self.log_info("Starting Cord service...")
        
        try:
            # Change to service directory
            os.chdir(self.service_dir)
            
            # Start service in background
            process = subprocess.Popen(
                ["cargo", "run", "--bin", "cord-service"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env={**os.environ, "RUST_LOG": "info"}
            )
            
            # Wait for service to start (with timeout)
            timeout = 15
            start_time = time.time()
            
            while time.time() - start_time < timeout:
                if self.check_service_status():
                    self.log_success(f"Service started successfully (PID: {process.pid})")
                    self.log_success(f"API available at {self.service_url}")
                    return True
                
                # Check if process died
                if process.poll() is not None:
                    stdout, stderr = process.communicate()
                    self.log_error("Service process died during startup")
                    if stderr:
                        self.log_error(f"Error output: {stderr.decode()}")
                    return False
                
                time.sleep(1)
                print(".", end="", flush=True)
            
            print()  # New line after dots
            self.log_error(f"Service failed to start within {timeout}s")
            
            # Kill the process if it's still running
            if process.poll() is None:
                process.terminate()
                time.sleep(2)
                if process.poll() is None:
                    process.kill()
                    
            return False
            
        except Exception as e:
            self.log_error(f"Failed to start service: {e}")
            return False
    
    def full_reset(self, restart_service: bool = True, force: bool = False) -> bool:
        """Perform complete database reset"""
        self.log("🔄 Cord Database Reset", Colors.WHITE)
        self.log("=" * 28, Colors.WHITE)
        print()
        
        success = True
        
        # Step 1: Stop service
        if not self.kill_service_processes(force=force):
            self.log_warning("Some service processes may still be running")
            success = False
            
        # Step 2: Reset database
        if not self.reset_sqlite_database():
            self.log_error("Database reset failed")
            success = False
            
        # Step 3: Start service if requested
        if restart_service and success:
            if not self.start_service():
                self.log_error("Service restart failed")
                success = False
                
        return success

def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(
        description="Cord Database Reset Utility",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    
    parser.add_argument("--check", action="store_true", help="Check database and service state")
    parser.add_argument("--sql-only", action="store_true", help="Generate SQL reset script only")
    parser.add_argument("--no-restart", action="store_true", help="Reset database without restarting service")
    parser.add_argument("--force", action="store_true", help="Force kill processes without confirmation")
    parser.add_argument("-v", "--verbose", action="store_true", help="Enable verbose logging")
    
    args = parser.parse_args()
    
    # Create database manager
    db_manager = DatabaseManager(verbose=args.verbose)
    
    try:
        if args.sql_only:
            print("📝 SQLite Reset Script:")
            print("=" * 23)
            print(db_manager.generate_sql_reset_script())
            
        elif args.check:
            db_manager.check_database_state()
            
        else:
            # Full reset
            restart_service = not args.no_restart
            
            if db_manager.full_reset(restart_service=restart_service, force=args.force):
                db_manager.log_success("Database reset completed successfully!")
                
                if restart_service:
                    db_manager.log_info("💡 You can now test with a clean slate")
                    db_manager.log_warning("Service is running in background")
                    db_manager.log_info("Use Ctrl+C or 'pkill -f cargo' to stop it")
                else:
                    db_manager.log_info("Database reset complete (service not restarted)")
                    
            else:
                db_manager.log_error("Database reset encountered errors")
                sys.exit(1)
                
    except KeyboardInterrupt:
        db_manager.log_warning("Operation cancelled by user")
        sys.exit(1)
    except Exception as e:
        db_manager.log_error(f"Unexpected error: {e}")
        if args.verbose:
            import traceback
            traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()