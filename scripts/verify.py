#!/usr/bin/env python3
"""Verify MemeFlow deployment on-chain"""

import json
import subprocess
import sys
from pathlib import Path

def run_cmd(cmd):
    """Run command and return output"""
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        return result.stdout, result.returncode == 0
    except Exception as e:
        return str(e), False

def verify_object(obj_id, name):
    """Verify an object exists on-chain"""
    print(f"\n{name}:")
    print(f"  {obj_id}")

    output, success = run_cmd(f"sui client object {obj_id} --json")
    if success:
        try:
            obj = json.loads(output)
            obj_type = obj.get("data", {}).get("type", "Package")
            print(f"  ✓ Valid - Type: {obj_type}")

            # Check if shared
            owner = obj.get("data", {}).get("owner", {})
            if isinstance(owner, dict) and "Shared" in owner:
                print(f"  ✓ Shared object")
            return True
        except json.JSONDecodeError:
            print(f"  ✗ Invalid JSON response")
            return False
    else:
        print(f"  ✗ Not found on chain")
        return False

def main():
    network = sys.argv[1] if len(sys.argv) > 1 else "devnet"

    print(f"\n🔍 Verifying MemeFlow deployment on {network}")
    print("━" * 60)

    # Load deployment config
    project_root = Path(__file__).parent.parent
    config_file = project_root / "public" / f"deployment-{network}.json"

    if not config_file.exists():
        print(f"\n✗ Deployment config not found: {config_file}")
        sys.exit(1)

    with open(config_file) as f:
        deployment = json.load(f)

    print(f"\nLoaded: {config_file.name}")
    print(f"Deployed: {deployment.get('deployedAt', 'Unknown')}")

    # Verify each component
    all_valid = True
    all_valid &= verify_object(deployment["packageId"], "Package")

    if "profileRegistryId" in deployment and deployment["profileRegistryId"]:
        all_valid &= verify_object(deployment["profileRegistryId"], "Profile Registry")

    if "factoryId" in deployment and deployment["factoryId"]:
        all_valid &= verify_object(deployment["factoryId"], "Factory")

    # Summary
    print("\n" + "━" * 60)
    if all_valid:
        print("✅ All components verified successfully")
        sys.exit(0)
    else:
        print("❌ Verification failed for some components")
        sys.exit(1)

if __name__ == "__main__":
    main()
