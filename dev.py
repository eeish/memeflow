#!/usr/bin/env python3
import argparse
import os
import re
import signal
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SERVICE_DIR = ROOT / "service"
LOGS_DIR = ROOT / "logs"
LOGS_DIR.mkdir(parents=True, exist_ok=True)

BACKEND_LOG = LOGS_DIR / "backend.log"
FRONTEND_LOG = LOGS_DIR / "frontend.log"
BACKEND_PID = LOGS_DIR / "backend.pid"
FRONTEND_PID = LOGS_DIR / "frontend.pid"
FRONTEND_PORT_FILE = LOGS_DIR / "frontend.port"

BACKEND_PORT = 3001
FRONTEND_PORT_FALLBACK_START = 3001

VITE_PORT_RE = re.compile(r"localhost:(\d+)")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _run(cmd, cwd=ROOT, env=None, stdout=None, stderr=None, background=False):
    if background:
        return subprocess.Popen(cmd, cwd=cwd, env=env, stdout=stdout, stderr=stderr, preexec_fn=os.setsid)
    return subprocess.run(cmd, cwd=cwd, env=env, check=False)


def _pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def _read_pid(path: Path):
    try:
        return int(path.read_text().strip())
    except Exception:
        return None


def _write_pid(path: Path, pid: int):
    path.write_text(str(pid))


def _kill_pid(pid: int, name: str):
    if pid is None:
        return False
    try:
        os.killpg(pid, signal.SIGTERM)
    except ProcessLookupError:
        return False
    except PermissionError:
        return False

    # Give it a moment to exit gracefully
    for _ in range(10):
        if not _pid_alive(pid):
            return True
        time.sleep(0.2)

    # Force kill
    try:
        os.killpg(pid, signal.SIGKILL)
    except ProcessLookupError:
        return True
    except PermissionError:
        return False

    return True


def _lsof_kill_port(port: int):
    try:
        out = subprocess.check_output(["lsof", "-ti", f":{port}"], text=True).strip()
    except subprocess.CalledProcessError:
        return

    if not out:
        return

    for line in out.splitlines():
        try:
            os.kill(int(line.strip()), signal.SIGTERM)
        except Exception:
            continue


def _detect_vite_port():
    if FRONTEND_PORT_FILE.exists():
        try:
            return int(FRONTEND_PORT_FILE.read_text().strip())
        except Exception:
            pass

    if FRONTEND_LOG.exists():
        try:
            content = FRONTEND_LOG.read_text(errors="ignore")
            match = VITE_PORT_RE.search(content)
            if match:
                return int(match.group(1))
        except Exception:
            pass

    return None


def _port_in_use(port: int) -> bool:
    try:
        subprocess.check_output(["lsof", "-Pi", f":{port}", "-sTCP:LISTEN", "-t"], text=True)
        return True
    except subprocess.CalledProcessError:
        return False


def _read_env_local() -> dict:
    """Read key=value pairs from .env.local, ignoring comments and blank lines."""
    env_file = ROOT / ".env.local"
    result = {}
    if not env_file.exists():
        return result
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        result[key.strip()] = val.strip()
    return result


def _tail_log(path: Path, n: int = 6) -> list:
    """Return last n non-empty lines from a log file."""
    if not path.exists():
        return []
    try:
        lines = [l for l in path.read_text(errors="ignore").splitlines() if l.strip()]
        return lines[-n:]
    except Exception:
        return []


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

def cmd_start(_args):
    env = _read_env_local()
    network = env.get("VITE_SUI_NETWORK", "unknown")
    pkg = env.get("VITE_PACKAGE_ID", "")
    pkg_short = (pkg[:10] + "..." + pkg[-6:]) if len(pkg) > 20 else (pkg or "not set")

    print(f"Network:  {network}")
    print(f"Package:  {pkg_short}")
    print(f"Logs:     {BACKEND_LOG.relative_to(ROOT)}  |  {FRONTEND_LOG.relative_to(ROOT)}")
    print()

    cmd_backend(_args)
    print()
    cmd_frontend(_args)


def cmd_backend(_args):
    if _port_in_use(BACKEND_PORT):
        print(f"Backend already running on :{BACKEND_PORT}")
        return

    print(f"Starting backend", end="", flush=True)

    env = os.environ.copy()
    env["RUST_LOG"] = "info,tower_http=debug,cord_service=debug"

    with BACKEND_LOG.open("w") as log:
        proc = _run([
            "cargo", "run", "--bin", "cord-service"
        ], cwd=SERVICE_DIR, env=env, stdout=log, stderr=log, background=True)

    _write_pid(BACKEND_PID, proc.pid)

    for _ in range(10):
        time.sleep(1)
        print(".", end="", flush=True)
        if _port_in_use(BACKEND_PORT):
            break
    print()

    if _port_in_use(BACKEND_PORT):
        print(f"Backend ready  :{BACKEND_PORT}  (PID {proc.pid})")
    else:
        print(f"Backend failed to start  (PID {proc.pid})")
        print(f"  Log: {BACKEND_LOG}")
        tail = _tail_log(BACKEND_LOG)
        if tail:
            print("  Last output:")
            for line in tail:
                print(f"    {line}")


def cmd_frontend(_args):
    print(f"Starting frontend", end="", flush=True)

    with FRONTEND_LOG.open("w") as log:
        proc = _run([
            "npm", "run", "dev", "--", "--host", "0.0.0.0"
        ], cwd=ROOT, stdout=log, stderr=log, background=True)

    _write_pid(FRONTEND_PID, proc.pid)

    port = None
    for _ in range(15):
        time.sleep(1)
        print(".", end="", flush=True)
        port = _detect_vite_port()
        if port:
            break
    print()

    if port and _port_in_use(port):
        FRONTEND_PORT_FILE.write_text(str(port))
        print(f"Frontend ready  :{port}  (PID {proc.pid})")
        print(f"  http://localhost:{port}")
    else:
        print(f"Frontend failed to start  (PID {proc.pid})")
        print(f"  Log: {FRONTEND_LOG}")
        tail = _tail_log(FRONTEND_LOG)
        if tail:
            print("  Last output:")
            for line in tail:
                print(f"    {line}")


def cmd_stop(_args):
    stopped = False

    front_pid = _read_pid(FRONTEND_PID)
    if front_pid:
        print(f"Stopping frontend  (PID {front_pid})...", end="", flush=True)
        ok = _kill_pid(front_pid, "frontend")
        print(" done" if ok else " not found")
        stopped |= ok
        FRONTEND_PID.unlink(missing_ok=True)

    back_pid = _read_pid(BACKEND_PID)
    if back_pid:
        print(f"Stopping backend   (PID {back_pid})...", end="", flush=True)
        ok = _kill_pid(back_pid, "backend")
        print(" done" if ok else " not found")
        stopped |= ok
        BACKEND_PID.unlink(missing_ok=True)

    # Fallback: kill by port
    _lsof_kill_port(BACKEND_PORT)

    front_port = _detect_vite_port()
    if front_port:
        _lsof_kill_port(front_port)
        FRONTEND_PORT_FILE.unlink(missing_ok=True)

    if not stopped:
        print("No tracked services running")


def cmd_status(_args):
    back_pid = _read_pid(BACKEND_PID)
    backend_running = _port_in_use(BACKEND_PORT)

    front_port = _detect_vite_port()
    front_pid = _read_pid(FRONTEND_PID)
    frontend_running = bool(front_port and _port_in_use(front_port))

    back_info = f"running  :{BACKEND_PORT}  PID {back_pid}" if backend_running else "stopped"
    front_info = f"running  :{front_port}  PID {front_pid}" if frontend_running else "stopped"

    print(f"Backend:   {back_info}")
    print(f"Frontend:  {front_info}")

    env = _read_env_local()
    network = env.get("VITE_SUI_NETWORK")
    if network:
        print(f"Network:   {network}")

    if backend_running or frontend_running:
        print(f"Logs:      ./dev.py logs [-f]")


def cmd_logs(args):
    service = args.service
    lines = args.lines
    follow = args.follow

    def tail(path: Path, label: str):
        if not path.exists():
            print(f"No log file: {path.name}")
            return
        if service == "both":
            print(f"=== {label} ===")
        cmd = ["tail", "-n", str(lines), str(path)]
        if follow:
            cmd = ["tail", "-f", str(path)]
        subprocess.run(cmd, check=False)

    if service in ("backend", "both"):
        tail(BACKEND_LOG, "backend")
    if service in ("frontend", "both"):
        tail(FRONTEND_LOG, "frontend")


def cmd_pass_through(args):
    subprocess.run(args.cmd, check=False)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def build_parser():
    parser = argparse.ArgumentParser(description="Cord development utility")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("start").set_defaults(func=cmd_start)
    sub.add_parser("backend").set_defaults(func=cmd_backend)
    sub.add_parser("frontend").set_defaults(func=cmd_frontend)
    sub.add_parser("stop").set_defaults(func=cmd_stop)
    sub.add_parser("status").set_defaults(func=cmd_status)

    logs = sub.add_parser("logs")
    logs.add_argument("service", nargs="?", default="both", choices=["backend", "frontend", "both"])
    logs.add_argument("-n", "--lines", type=int, default=50)
    logs.add_argument("-f", "--follow", action="store_true")
    logs.set_defaults(func=cmd_logs)

    passthrough = sub.add_parser("run", help="Run an arbitrary command")
    passthrough.add_argument("cmd", nargs=argparse.REMAINDER)
    passthrough.set_defaults(func=cmd_pass_through)

    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
