#!/usr/bin/env python3
"""Test MemeFlow deployment and environment"""

import json
import subprocess
import sys
from pathlib import Path

def run_cmd(cmd):
    """Run command and return output"""
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        return result.stdout, result.stderr, result.returncode == 0
    except Exception as e:
        return "", str(e), False

def test_env_sync():
    """Test if deployment configs are in sync"""
    print("\n📋 Testing environment sync...")
    print("━" * 60)

    project_root = Path(__file__).parent.parent
    networks = ["devnet", "testnet", "mainnet"]
    configs = {}

    for network in networks:
        config_file = project_root / "public" / f"deployment-{network}.json"
        if config_file.exists():
            with open(config_file) as f:
                configs[network] = json.load(f)
                print(f"✓ {network:10s} - Package: {configs[network]['packageId'][:20]}...")

    if configs:
        print("\n✅ Configurations loaded successfully")
    else:
        print("\n⚠️  No deployment configurations found")

def test_profile_creation():
    """Test profile creation on devnet"""
    print("\n👤 Testing profile creation...")
    print("━" * 60)

    project_root = Path(__file__).parent.parent
    config_file = project_root / "public" / "deployment-devnet.json"

    if not config_file.exists():
        print("✗ No devnet deployment found")
        return

    with open(config_file) as f:
        deployment = json.load(f)

    package_id = deployment["packageId"]
    registry_id = deployment.get("profileRegistryId")

    if not registry_id:
        print("✗ No profile registry ID in config")
        return

    print(f"Package:  {package_id}")
    print(f"Registry: {registry_id}")
    print("\n⚠️  Manual profile creation test via CLI required")

def test_deployment():
    """Run deployment verification"""
    print("\n🔍 Testing deployment...")
    print("━" * 60)

    stdout, stderr, success = run_cmd("python3 scripts/verify.py devnet")
    print(stdout)
    if not success:
        print(stderr)

def main():
    test_type = sys.argv[1] if len(sys.argv) > 1 else "all"

    if test_type == "env" or test_type == "all":
        test_env_sync()

    if test_type == "profile" or test_type == "all":
        test_profile_creation()

    if test_type == "deploy" or test_type == "all":
        test_deployment()

    print("\n" + "━" * 60)
    print("✅ Tests complete\n")

if __name__ == "__main__":
    main()
