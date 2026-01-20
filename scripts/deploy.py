#!/usr/bin/env python3
"""MemeFlow Contract Deployment Script."""

import argparse
import json
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


@dataclass
class NetworkConfig:
    rpc_url: str
    explorer_url: str


NETWORKS: dict[str, NetworkConfig] = {
    "devnet": NetworkConfig(
        rpc_url="https://fullnode.devnet.sui.io:443",
        explorer_url="https://suiscan.xyz/devnet",
    ),
    "testnet": NetworkConfig(
        rpc_url="https://fullnode.testnet.sui.io:443",
        explorer_url="https://suiscan.xyz/testnet",
    ),
    "mainnet": NetworkConfig(
        rpc_url="https://fullnode.mainnet.sui.io:443",
        explorer_url="https://suiscan.xyz/mainnet",
    ),
    "local": NetworkConfig(
        rpc_url="http://127.0.0.1:9000",
        explorer_url="http://localhost:3000",
    ),
}


def run(
    cmd: list[str], capture: bool = False, check: bool = True, cwd: Path | None = None
) -> subprocess.CompletedProcess:
    """Run a command and return the result."""
    return subprocess.run(cmd, capture_output=capture, text=True, check=check, cwd=cwd)


def switch_network(network: str) -> None:
    """Switch Sui client to the specified network."""
    result = run(["sui", "client", "switch", "--env", network], capture=True, check=False)
    if result.returncode != 0:
        rpc = NETWORKS.get(network, NETWORKS["local"]).rpc_url
        run(["sui", "client", "new-env", "--alias", network, "--rpc", rpc])


def get_active_address() -> str:
    """Get the active Sui address."""
    result = run(["sui", "client", "active-address"], capture=True)
    return result.stdout.strip()


def clean_build(contract_dir: Path, network: str) -> None:
    """Remove build artifacts and ephemeral publication files for a clean publish."""
    import shutil

    build_dir = contract_dir / "build"
    if build_dir.exists():
        shutil.rmtree(build_dir)

    # Remove ephemeral publication file for this network
    pub_file = contract_dir / f"Pub.{network}.toml"
    if pub_file.exists():
        pub_file.unlink()


def publish_contracts(contract_dir: Path, network: str, gas_budget: int = 500_000_000) -> dict:
    """Publish contracts and return the JSON output."""
    # Use test-publish for dev networks (ephemeral addresses), publish for mainnet
    if network != "mainnet":
        cmd = ["sui", "client", "test-publish", ".",
               "--build-env", network, "--gas-budget", str(gas_budget), "--json"]
    else:
        cmd = ["sui", "client", "publish", ".",
               "--gas-budget", str(gas_budget), "--json"]
    result = run(cmd, capture=True, check=False, cwd=contract_dir)

    # Extract JSON from output (may contain non-JSON prefix/suffix)
    output = result.stdout + result.stderr

    # Find the JSON object by locating balanced braces
    start = output.find("{")
    if start == -1:
        print(f"Deployment failed: no JSON output found\n{output}", file=sys.stderr)
        sys.exit(1)

    depth = 0
    end = start
    for i, c in enumerate(output[start:], start):
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                break

    try:
        return json.loads(output[start:end])
    except json.JSONDecodeError as e:
        print(f"Deployment failed: invalid JSON output\n{e}\n{output}", file=sys.stderr)
        sys.exit(1)


def parse_deployment(data: dict) -> dict:
    """Parse deployment output and extract relevant fields."""
    changes = data.get("objectChanges", [])

    package_id = None
    profile_registry = None
    factory = None

    for obj in changes:
        if obj.get("type") == "published":
            package_id = obj.get("packageId")
        elif obj.get("type") == "created":
            obj_type = obj.get("objectType", "")
            if "ProfileRegistry" in obj_type:
                profile_registry = obj.get("objectId")
            elif "Factory" in obj_type:
                factory = obj.get("objectId")

    if not package_id:
        print(f"Deployment failed: no package ID found\n{json.dumps(data, indent=2)}", file=sys.stderr)
        sys.exit(1)

    gas = data.get("effects", {}).get("gasUsed", {})
    created = [o for o in changes if o.get("type") in ("created", "published")]
    shared = [o for o in changes if o.get("type") == "created" and isinstance(o.get("owner"), dict) and "Shared" in o.get("owner", {})]

    return {
        "packageId": package_id,
        "profileRegistryId": profile_registry,
        "factoryId": factory,
        "deploymentTx": data.get("digest"),
        "gasUsed": {
            "computationCost": gas.get("computationCost"),
            "storageCost": gas.get("storageCost"),
            "storageRebate": gas.get("storageRebate"),
            "nonRefundableStorageFee": gas.get("nonRefundableStorageFee"),
        },
        "totalObjectsCreated": len(created),
        "sharedObjectsCreated": len(shared),
    }


def deploy(network: str) -> None:
    """Deploy MemeFlow contracts to the specified network."""
    project_root = Path(__file__).resolve().parent.parent
    contract_dir = project_root / "contracts" / "memeflow"
    deployment_file = project_root / "public" / f"deployment-{network}.json"

    net_config = NETWORKS.get(network, NETWORKS["local"])

    print(f"Deploying MemeFlow to {network}")
    print("=" * 50)

    # Switch network
    print(f"Switching to {network}...")
    switch_network(network)

    # Clean previous build and publication files
    print("Cleaning build artifacts...")
    clean_build(contract_dir, network)

    # Publish (this also builds)
    print(f"Publishing to {network}...")
    publish_output = publish_contracts(contract_dir, network)
    deployment = parse_deployment(publish_output)

    # Get deployer
    deployer = get_active_address()

    # Build config
    config = {
        "network": network,
        "rpcUrl": net_config.rpc_url,
        "explorerUrl": net_config.explorer_url,
        **deployment,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "deployer": deployer,
        "status": "deployed",
    }

    # Save
    deployment_file.parent.mkdir(parents=True, exist_ok=True)
    deployment_file.write_text(json.dumps(config, indent=2) + "\n")

    # Output summary
    print("=" * 50)
    print("Deployment successful!")
    print()
    print(f"Network:            {network}")
    print(f"Package ID:         {deployment['packageId']}")
    print(f"Profile Registry:   {deployment['profileRegistryId']}")
    print(f"Factory:            {deployment['factoryId']}")
    print(f"Transaction:        {deployment['deploymentTx']}")
    print(f"Deployer:           {deployer}")
    print()
    print(f"Config saved to:    {deployment_file}")
    print()
    print("Important: Restart your dev server to load the new deployment config!")
    print("   Run: npm run dev")
    print("=" * 50)


def main() -> None:
    parser = argparse.ArgumentParser(description="Deploy MemeFlow contracts to Sui network")
    parser.add_argument(
        "network",
        nargs="?",
        default="devnet",
        choices=["devnet", "testnet", "mainnet", "local"],
        help="Target network (default: devnet)",
    )
    args = parser.parse_args()
    deploy(args.network)


if __name__ == "__main__":
    main()
