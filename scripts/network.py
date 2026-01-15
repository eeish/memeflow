#!/usr/bin/env python3
"""Manage local Sui network"""

import subprocess
import sys
import time

def run_cmd(cmd, check=True):
    """Run command"""
    try:
        if check:
            subprocess.run(cmd, shell=True, check=True)
        else:
            subprocess.run(cmd, shell=True)
    except subprocess.CalledProcessError as e:
        print(f"Error: {e}")
        sys.exit(1)

def start_network():
    """Start local Sui network"""
    print("🚀 Starting local Sui network...")
    print("━" * 60)

    # Kill existing processes
    print("Stopping existing network...")
    run_cmd("pkill -f sui-test-validator || true", check=False)
    time.sleep(2)

    # Start network
    print("\nStarting validator...")
    print("This will run in the foreground. Press Ctrl+C to stop.\n")
    run_cmd("sui-test-validator")

def stop_network():
    """Stop local Sui network"""
    print("🛑 Stopping local Sui network...")
    run_cmd("pkill -f sui-test-validator || true", check=False)
    print("✅ Network stopped")

def status_network():
    """Check network status"""
    print("📊 Network status...")
    print("━" * 60)

    result = subprocess.run(
        "pgrep -f sui-test-validator",
        shell=True,
        capture_output=True
    )

    if result.returncode == 0:
        print("✅ Local network is running")
        print(f"PID: {result.stdout.decode().strip()}")
    else:
        print("⚠️  Local network is not running")

def main():
    if len(sys.argv) < 2:
        print("Usage: network.py [start|stop|status]")
        sys.exit(1)

    action = sys.argv[1]

    if action == "start":
        start_network()
    elif action == "stop":
        stop_network()
    elif action == "status":
        status_network()
    else:
        print(f"Unknown action: {action}")
        sys.exit(1)

if __name__ == "__main__":
    main()
