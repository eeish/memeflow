#!/usr/bin/env python3
"""
Cord Database Reset Utility (PostgreSQL)

Truncates all application tables in the Cord PostgreSQL database while
preserving the schema. Reads the connection URL from DATABASE_URL (or
service/.env).

Usage:
    python reset_database.py [options]

Options:
    --help, -h          Show this help message
    --check             Check current database and service state
    --no-restart        Reset database without restarting the service
    --force             Force-kill processes without confirmation
    --verbose, -v       Enable verbose logging

Examples:
    python reset_database.py                  # Full reset with service restart
    python reset_database.py --check         # Show table counts and service status
    python reset_database.py --no-restart    # Reset DB only, don't restart service
"""

import argparse
import os
import subprocess
import sys
import time
import signal
from pathlib import Path
from typing import Optional, List

# psycopg2 is the standard PostgreSQL adapter for Python.
# Install with: pip install psycopg2-binary  (or psycopg2)
try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("❌ psycopg2 is required: pip install psycopg2-binary")
    sys.exit(1)

try:
    import requests
except ImportError:
    requests = None  # health check is optional


# ---------------------------------------------------------------------------
# Colours
# ---------------------------------------------------------------------------

class Colors:
    RED    = '\033[0;31m'
    GREEN  = '\033[0;32m'
    YELLOW = '\033[1;33m'
    BLUE   = '\033[0;34m'
    CYAN   = '\033[0;36m'
    WHITE  = '\033[1;37m'
    NC     = '\033[0m'


# ---------------------------------------------------------------------------
# Tables to truncate (order respects FK dependencies)
# ---------------------------------------------------------------------------

TABLES = [
    "swap_events",
    "graduation_launches",
    "media_blobs",
    "notifications",
    "likes",
    "comments",
    "posts",
    "follows",
    "users",
]


# ---------------------------------------------------------------------------
# Helper: load DATABASE_URL
# ---------------------------------------------------------------------------

def _load_database_url() -> str:
    """Return DATABASE_URL, falling back to service/.env."""
    url = os.environ.get("DATABASE_URL")
    if url:
        return url

    script_dir = Path(__file__).parent
    env_file = script_dir.parent / "service" / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line.startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip()

    return "postgres://cord:cord@localhost:5432/cord"


# ---------------------------------------------------------------------------
# DatabaseManager
# ---------------------------------------------------------------------------

class DatabaseManager:
    def __init__(self, verbose: bool = False):
        self.verbose = verbose
        self.script_dir = Path(__file__).parent
        self.service_dir = self.script_dir.parent / "service"
        self.port = 3001
        self.service_url = f"http://localhost:{self.port}"
        self.database_url = _load_database_url()

    # ── Logging helpers ──────────────────────────────────────────────────────

    def log(self, msg: str, color: str = Colors.NC):
        print(f"{color}{msg}{Colors.NC}")

    def verbose_log(self, msg: str):
        if self.verbose:
            self.log(f"🔍 {msg}", Colors.CYAN)

    def log_success(self, msg: str): self.log(f"✅ {msg}", Colors.GREEN)
    def log_warning(self, msg: str): self.log(f"⚠️  {msg}", Colors.YELLOW)
    def log_error(self, msg: str):   self.log(f"❌ {msg}", Colors.RED)
    def log_info(self, msg: str):    self.log(f"ℹ️  {msg}", Colors.BLUE)

    # ── Database connection ───────────────────────────────────────────────────

    def _connect(self):
        """Return a psycopg2 connection using DATABASE_URL."""
        self.verbose_log(f"Connecting to: {self.database_url}")
        return psycopg2.connect(self.database_url)

    # ── Service process helpers ───────────────────────────────────────────────

    def find_service_processes(self) -> List[int]:
        try:
            result = subprocess.run(
                ["lsof", "-ti", f":{self.port}"],
                capture_output=True, text=True, check=False,
            )
            if result.stdout.strip():
                return [int(p) for p in result.stdout.strip().split('\n') if p.strip()]
        except Exception as e:
            self.verbose_log(f"Error checking processes: {e}")
        return []

    def kill_service_processes(self, force: bool = False) -> bool:
        pids = self.find_service_processes()
        if not pids:
            self.log_info("No service processes to stop")
            return True

        self.log_info(f"Stopping {len(pids)} service process(es)…")
        for pid in pids:
            try:
                os.kill(pid, signal.SIGTERM)
                self.log_success(f"Sent SIGTERM to process {pid}")
            except ProcessLookupError:
                self.verbose_log(f"Process {pid} already stopped")
            except Exception as e:
                self.log_warning(f"Failed to terminate process {pid}: {e}")

        time.sleep(2)

        remaining = self.find_service_processes()
        if remaining and force:
            self.log_warning("Force killing remaining processes…")
            for pid in remaining:
                try:
                    os.kill(pid, signal.SIGKILL)
                    self.log_success(f"Force killed process {pid}")
                except Exception as e:
                    self.log_warning(f"Failed to force kill {pid}: {e}")

        return len(self.find_service_processes()) == 0

    def check_service_status(self) -> bool:
        if requests is None:
            return False
        try:
            resp = requests.get(f"{self.service_url}/health", timeout=5)
            return resp.status_code == 200 and resp.json().get("success", False)
        except Exception:
            return False

    # ── Database operations ───────────────────────────────────────────────────

    def check_database_state(self):
        """Print table row counts and service status."""
        self.log("🔍 Cord Database Status", Colors.WHITE)
        self.log("=" * 30, Colors.WHITE)
        print()

        try:
            conn = self._connect()
            conn.autocommit = True
            cur = conn.cursor()

            self.log_success(f"Connected to PostgreSQL: {self.database_url}")
            print()

            cur.execute("""
                SELECT table_name FROM information_schema.tables
                WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
                ORDER BY table_name
            """)
            existing_tables = {row[0] for row in cur.fetchall()}

            self.log_info("Table counts:")
            for table in TABLES:
                if table in existing_tables:
                    cur.execute(f"SELECT COUNT(*) FROM {table}")
                    count = cur.fetchone()[0]
                    self.log_info(f"  {table}: {count:,} rows")
                else:
                    self.log_warning(f"  {table}: table not found")

            cur.close()
            conn.close()

        except Exception as e:
            self.log_error(f"Could not connect to database: {e}")
            self.log_info(f"DATABASE_URL: {self.database_url}")
            self.log_info("Is the database running? Try: docker compose -f docker-compose.dev.yml up -d postgres")

        print()

        # Service status
        pids = self.find_service_processes()
        if pids:
            self.log_success(f"Service running (PIDs: {', '.join(map(str, pids))})")
            if self.check_service_status():
                self.log_success(f"Service responding at {self.service_url}/health")
            else:
                self.log_warning("Service not responding to health checks")
        else:
            self.log_warning("Service is not running")

        print()

    def reset_database(self) -> bool:
        """Truncate all application tables, preserving the schema."""
        self.log_info(f"Resetting database: {self.database_url}")

        try:
            conn = self._connect()
            cur = conn.cursor()

            # Disable FK checks for the session, truncate, re-enable
            cur.execute("SET session_replication_role = 'replica'")

            for table in TABLES:
                cur.execute(f"TRUNCATE TABLE {table} RESTART IDENTITY CASCADE")
                self.verbose_log(f"Truncated {table}")

            cur.execute("SET session_replication_role = 'origin'")
            conn.commit()
            cur.close()
            conn.close()

            self.log_success("All tables truncated successfully")
            return True

        except Exception as e:
            self.log_error(f"Database reset failed: {e}")
            self.log_info("Is the database running?")
            self.log_info("  docker compose -f docker-compose.dev.yml up -d postgres")
            return False

    def start_service(self) -> bool:
        """Start cord-service and wait for it to respond."""
        self.log_info("Starting Cord service…")
        try:
            process = subprocess.Popen(
                ["cargo", "run", "--bin", "cord-service"],
                cwd=self.service_dir,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env={**os.environ, "RUST_LOG": "info"},
            )

            timeout = 30
            start = time.time()
            while time.time() - start < timeout:
                if self.check_service_status():
                    self.log_success(f"Service started (PID {process.pid})")
                    self.log_success(f"API: {self.service_url}")
                    return True
                if process.poll() is not None:
                    _, stderr = process.communicate()
                    self.log_error("Service process died during startup")
                    if stderr:
                        self.log_error(stderr.decode())
                    return False
                time.sleep(1)
                print(".", end="", flush=True)

            print()
            self.log_error(f"Service did not start within {timeout}s")
            if process.poll() is None:
                process.terminate()
            return False

        except Exception as e:
            self.log_error(f"Failed to start service: {e}")
            return False

    def full_reset(self, restart_service: bool = True, force: bool = False) -> bool:
        self.log("🔄 Cord Database Reset", Colors.WHITE)
        self.log("=" * 28, Colors.WHITE)
        print()

        success = True

        if not self.kill_service_processes(force=force):
            self.log_warning("Some service processes may still be running")
            success = False

        if not self.reset_database():
            self.log_error("Database reset failed")
            success = False

        if restart_service and success:
            if not self.start_service():
                self.log_error("Service restart failed")
                success = False

        return success


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Cord Database Reset Utility",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--check",      action="store_true", help="Show table counts and service status")
    parser.add_argument("--no-restart", action="store_true", help="Reset DB without restarting service")
    parser.add_argument("--force",      action="store_true", help="Force-kill processes")
    parser.add_argument("-v", "--verbose", action="store_true", help="Verbose output")

    args = parser.parse_args()
    mgr = DatabaseManager(verbose=args.verbose)

    try:
        if args.check:
            mgr.check_database_state()
        elif mgr.full_reset(restart_service=not args.no_restart, force=args.force):
            mgr.log_success("Database reset completed successfully!")
            if not args.no_restart:
                mgr.log_warning("Service is running in the background")
                mgr.log_info("Use Ctrl+C or 'pkill -f cord-service' to stop it")
            else:
                mgr.log_info("Database reset complete (service not restarted)")
        else:
            mgr.log_error("Database reset encountered errors")
            sys.exit(1)

    except KeyboardInterrupt:
        mgr.log_warning("Cancelled by user")
        sys.exit(1)
    except Exception as e:
        mgr.log_error(f"Unexpected error: {e}")
        if args.verbose:
            import traceback
            traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
