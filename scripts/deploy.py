#!/usr/bin/env python3
"""Cord Contract Deployment Script with Package Upgrade Support.

This script supports both initial deployment and package upgrades:
- First deployment: Creates new package and stores UpgradeCap
- Subsequent deployments: Uses upgrade to preserve packageId and user markets

Publishing strategy:
- devnet/testnet/local: Uses test-publish (ephemeral Pub.<env>.toml) to avoid
  chain ID mismatches when networks are reset.
- mainnet: Uses publish (permanent Publications.toml) with stable chain ID.

Both test-publish and publish create an UpgradeCap on-chain, so upgrades work
regardless of which command was used for the initial deployment.
"""

import argparse
import json
import re
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

try:
    import tomllib
except ModuleNotFoundError:  # pragma: no cover
    tomllib = None

# ---------------------------------------------------------------------------
# ANSI color helpers
# ---------------------------------------------------------------------------

_NO_COLOR = not sys.stdout.isatty()


def _c(code: str, text: str) -> str:
    if _NO_COLOR:
        return text
    return f"\033[{code}m{text}\033[0m"


def info(text: str) -> None:
    print(_c("36", text))  # cyan


def success(text: str) -> None:
    print(_c("32", text))  # green


def warn(text: str) -> None:
    print(_c("33", f"⚠ {text}"))  # yellow


def error(text: str) -> None:
    print(_c("31", f"✗ {text}"), file=sys.stderr)  # red


def dim(text: str) -> str:
    return _c("2", text)


def bold(text: str) -> str:
    return _c("1", text)


def header(text: str) -> None:
    line = "━" * 50
    print()
    print(_c("1;36", line))
    print(_c("1;36", f"  {text}"))
    print(_c("1;36", line))


def label_value(label: str, value: str) -> None:
    print(f"  {_c('2', label.ljust(20))} {value}")


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

def mist_to_sui(mist: str | int | None) -> str:
    """Convert MIST (integer string) to human-readable SUI amount."""
    if mist is None:
        return "—"
    try:
        return f"{int(mist) / 1_000_000_000:.4f} SUI"
    except (ValueError, TypeError):
        return str(mist)


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

MIN_MAX_SUPPLY = 2
MAX_MAX_SUPPLY = 10_000
CURVE_TERM2_GAP = 8


def run(
    cmd: list[str], capture: bool = False, check: bool = True, cwd: Path | None = None
) -> subprocess.CompletedProcess:
    """Run a command and return the result."""
    # Show the command being executed (dim)
    display = " ".join(cmd)
    print(dim(f"  $ {display}"))
    return subprocess.run(cmd, capture_output=capture, text=True, check=check, cwd=cwd)


# ---------------------------------------------------------------------------
# Prerequisite checks
# ---------------------------------------------------------------------------

def check_prerequisites(network: str) -> None:
    """Verify environment is ready for deployment."""
    header(f"Prerequisites  ·  {network}")

    # 1. Check sui CLI exists
    try:
        result = subprocess.run(
            ["sui", "--version"], capture_output=True, text=True, check=True,
        )
        label_value("sui version", result.stdout.strip())
    except FileNotFoundError:
        error("'sui' CLI not found. Install it: https://docs.sui.io/guides/developer/getting-started/sui-install")
        sys.exit(1)

    # 2. Active address
    try:
        result = subprocess.run(
            ["sui", "client", "active-address"], capture_output=True, text=True, check=True,
        )
        address = result.stdout.strip()
        label_value("active address", address)
    except subprocess.CalledProcessError:
        error("No active Sui address. Run 'sui client active-address' to set one up.")
        sys.exit(1)

    # 3. Gas balance
    try:
        result = subprocess.run(
            ["sui", "client", "gas", "--json"], capture_output=True, text=True, check=True,
        )
        coins = json.loads(result.stdout)
        total_mist = sum(int(c.get("mistBalance", c.get("balance", 0))) for c in coins)
        sui_amount = total_mist / 1_000_000_000
        balance_str = f"{sui_amount:.4f} SUI"
        if sui_amount < 0.5:
            label_value("balance", balance_str)
            warn(f"Low balance ({balance_str}). Deployment needs ~0.5 SUI. Request from faucet: https://faucet.sui.io/")
        else:
            label_value("balance", balance_str)
    except (subprocess.CalledProcessError, json.JSONDecodeError, KeyError):
        label_value("balance", "unknown (could not query)")

    print()


# ---------------------------------------------------------------------------
# Network switching
# ---------------------------------------------------------------------------

def switch_network(network: str) -> None:
    """Switch Sui client to the specified network."""
    result = run(["sui", "client", "switch", "--env", network], capture=True, check=False)
    if result.returncode != 0:
        rpc = NETWORKS.get(network, NETWORKS["local"]).rpc_url
        run(["sui", "client", "new-env", "--alias", network, "--rpc", rpc], capture=True)
        # new-env registers but does NOT activate — switch explicitly
        run(["sui", "client", "switch", "--env", network], capture=True)


def get_active_address() -> str:
    """Get the active Sui address."""
    result = run(["sui", "client", "active-address"], capture=True)
    return result.stdout.strip()


# ---------------------------------------------------------------------------
# Runtime config generation
# ---------------------------------------------------------------------------

def _load_toml_file(path: Path) -> dict:
    if not path.exists():
        return {}
    if tomllib is None:
        error("Python tomllib is unavailable. Use Python 3.11+ to parse config TOML files.")
        sys.exit(1)
    return tomllib.loads(path.read_text())


def load_network_runtime_config(contract_dir: Path, network: str) -> dict:
    """Load config/default.toml and config/<network>.toml (network overrides default)."""
    config_dir = contract_dir / "config"
    default_cfg = _load_toml_file(config_dir / "default.toml")
    network_cfg = _load_toml_file(config_dir / f"{network}.toml")

    # Deep merge only for one level sections we currently use.
    merged = dict(default_cfg)
    for key, value in network_cfg.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = {**merged[key], **value}
        else:
            merged[key] = value
    return merged


def resolve_max_supply(runtime_cfg: dict) -> int:
    """Resolve and validate Phase 1 max supply from config."""
    phase1 = runtime_cfg.get("phase1", {}) if isinstance(runtime_cfg.get("phase1"), dict) else {}
    raw = phase1.get("max_supply", runtime_cfg.get("max_supply"))

    if raw is None:
        error("Missing required config: phase1.max_supply")
        sys.exit(1)

    try:
        max_supply = int(raw)
    except (ValueError, TypeError):
        error(f"Invalid max_supply value: {raw}")
        sys.exit(1)

    if max_supply < MIN_MAX_SUPPLY or max_supply > MAX_MAX_SUPPLY:
        error(
            f"max_supply must be between {MIN_MAX_SUPPLY} and {MAX_MAX_SUPPLY}, got {max_supply}"
        )
        sys.exit(1)

    return max_supply


def write_runtime_config_move(contract_dir: Path, max_supply: int) -> Path:
    """Generate sources/runtime_config.move consumed by Move modules."""
    target = contract_dir / "sources" / "runtime_config.move"
    term2_denom_base = max_supply + CURVE_TERM2_GAP
    content = f"""/// Auto-generated by scripts/deploy.py
/// Do not edit manually. Source of truth: contracts/cord/config/*.toml
module cord::runtime_config {{
    const MAX_SUPPLY: u64 = {max_supply};
    const TERM2_DENOM_BASE: u64 = {term2_denom_base};

    public fun max_supply(): u64 {{
        MAX_SUPPLY
    }}

    public fun term2_denom_base(): u64 {{
        TERM2_DENOM_BASE
    }}

    public fun graduation_limit(): u64 {{
        MAX_SUPPLY
    }}
}}
"""
    target.write_text(content)
    return target


# ---------------------------------------------------------------------------
# Build / clean
# ---------------------------------------------------------------------------

def clean_build(contract_dir: Path, network: str, *, keep_pub_file: bool = False) -> None:
    """Remove build artifacts for a clean build."""
    build_dir = contract_dir / "build"
    if build_dir.exists():
        shutil.rmtree(build_dir)

    if not keep_pub_file:
        pub_file = contract_dir / f"Pub.{network}.toml"
        if pub_file.exists():
            pub_file.unlink()


def sync_move_toml_package_id(contract_dir: Path, package_id: str) -> None:
    """Keep Move.toml aligned with the deployed package for upgrades."""
    move_toml = contract_dir / "Move.toml"
    content = move_toml.read_text()

    published_pattern = r'^(published-at\s*=\s*")[^"]*(")$'
    address_pattern = r'^(cord\s*=\s*")[^"]*(")$'

    content = re.sub(published_pattern, rf'\g<1>{package_id}\2', content, flags=re.MULTILINE)
    content = re.sub(address_pattern, rf'\g<1>{package_id}\2', content, flags=re.MULTILINE)

    move_toml.write_text(content)


# ---------------------------------------------------------------------------
# JSON / transaction helpers
# ---------------------------------------------------------------------------

def load_existing_deployment(deployment_file: Path) -> dict | None:
    """Load existing deployment config if it exists."""
    if deployment_file.exists():
        try:
            return json.loads(deployment_file.read_text())
        except json.JSONDecodeError:
            return None
    return None


def extract_json(result: subprocess.CompletedProcess) -> dict:
    """Extract JSON object from command output.

    Handles two failure modes:
    1. Compilation error — non-zero exit with no JSON → show compiler output.
    2. Malformed JSON — parse error → show raw output.
    """
    output = result.stdout + result.stderr

    start = output.find("{")

    # No JSON at all — likely a compile error
    if start == -1:
        if result.returncode != 0:
            error("Contract compilation failed")
            print()
            # Show the actual compiler output so the developer can fix it
            print(output.strip())
            print()
            info("Fix the errors above and try again.")
        else:
            error("No JSON output found in command result")
            print(output.strip(), file=sys.stderr)
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
        error(f"Invalid JSON output: {e}")
        print(output.strip(), file=sys.stderr)
        sys.exit(1)


def check_tx_status(data: dict) -> None:
    """Verify that the on-chain transaction succeeded.

    The sui CLI returns JSON even for failed transactions (out of gas, abort,
    etc.). This function checks effects.status and exits with a clear error
    if the transaction did not succeed.
    """
    status = data.get("effects", {}).get("status", {})
    if status.get("status") == "success":
        return

    error("Transaction failed on-chain")
    print()
    tx_error = status.get("error", "unknown error")
    print(f"  {bold('Status:')}  {status.get('status', 'unknown')}")
    print(f"  {bold('Error:')}   {tx_error}")
    print()

    # Show gas used even on failure — helps diagnose out-of-gas
    gas = data.get("effects", {}).get("gasUsed", {})
    if gas:
        total = int(gas.get("computationCost", 0)) + int(gas.get("storageCost", 0)) - int(gas.get("storageRebate", 0))
        print(f"  {bold('Gas used:')} {mist_to_sui(total)}")
        print()

    if "InsufficientGas" in str(tx_error) or "out of gas" in str(tx_error).lower():
        info("Hint: Request more SUI from the faucet: https://faucet.sui.io/")
    elif "MoveAbort" in str(tx_error):
        info("Hint: A Move abort occurred. Check the error code against your contract's abort constants.")

    sys.exit(1)


# ---------------------------------------------------------------------------
# Chain-ID staleness detection
# ---------------------------------------------------------------------------

def get_current_chain_id() -> str | None:
    """Query the current chain identifier from the active RPC."""
    try:
        result = subprocess.run(
            ["sui", "client", "chain-identifier"],
            capture_output=True, text=True, check=True,
        )
        return result.stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def check_chain_id(contract_dir: Path, network: str) -> None:
    """Detect devnet/testnet resets by comparing chain-id in Pub file vs live."""
    if network in ("mainnet", "local"):
        return

    pub_file = contract_dir / f"Pub.{network}.toml"
    if not pub_file.exists():
        return

    # Parse chain-id from the TOML (simple regex — avoids toml dependency)
    content = pub_file.read_text()
    match = re.search(r'chain-id\s*=\s*"([^"]+)"', content)
    if not match:
        return

    stored_chain_id = match.group(1)
    live_chain_id = get_current_chain_id()

    if live_chain_id and stored_chain_id != live_chain_id:
        error(f"Network was reset — chain-id changed")
        print()
        print(f"  {bold('Stored:')} {stored_chain_id}")
        print(f"  {bold('Live:')}   {live_chain_id}")
        print()
        info(f"The {network} network was reset since your last deployment.")
        info(f"Run with --fresh for a new deployment:")
        print(f"  python scripts/deploy.py {network} --fresh")
        sys.exit(1)


# ---------------------------------------------------------------------------
# Publish / upgrade
# ---------------------------------------------------------------------------

def publish_contracts(contract_dir: Path, network: str, gas_budget: int = 500_000_000) -> dict:
    """Publish contracts (initial deployment) and return the JSON output."""
    if network == "mainnet":
        cmd = ["sui", "client", "publish", ".",
               "--gas-budget", str(gas_budget), "--json"]
    else:
        cmd = ["sui", "client", "test-publish", ".",
               "--build-env", network, "--gas-budget", str(gas_budget), "--json"]

    result = run(cmd, capture=True, check=False, cwd=contract_dir)
    data = extract_json(result)
    check_tx_status(data)
    return data


def upgrade_contracts(
    contract_dir: Path,
    network: str,
    upgrade_cap_id: str,
    gas_budget: int = 500_000_000,
) -> dict:
    """Upgrade contracts (preserves packageId) and return the JSON output."""
    cmd = [
        "sui", "client", "upgrade", ".",
        "--upgrade-capability", upgrade_cap_id,
        "--gas-budget", str(gas_budget),
        "--json",
    ]
    if network != "mainnet":
        cmd[4:4] = ["--build-env", network]

    result = run(cmd, capture=True, check=False, cwd=contract_dir)
    data = extract_json(result)
    check_tx_status(data)
    return data


# ---------------------------------------------------------------------------
# Output parsing
# ---------------------------------------------------------------------------

def parse_publish_output(data: dict) -> dict:
    """Parse initial publish output and extract relevant fields."""
    changes = data.get("objectChanges", [])

    package_id = None
    upgrade_cap_id = None
    graduation_registry_id = None

    for obj in changes:
        if obj.get("type") == "published":
            package_id = obj.get("packageId")
        elif obj.get("type") == "created":
            obj_type = obj.get("objectType", "")
            if "UpgradeCap" in obj_type:
                upgrade_cap_id = obj.get("objectId")
            if (
                "::graduation::GraduationRegistry" in obj_type
                and isinstance(obj.get("owner"), dict)
                and "Shared" in obj.get("owner", {})
            ):
                graduation_registry_id = obj.get("objectId")

    if not package_id:
        error("No package ID found in transaction output")
        print(json.dumps(data, indent=2), file=sys.stderr)
        sys.exit(1)

    if not upgrade_cap_id:
        warn("No UpgradeCap found. Future upgrades will not be possible.")

    gas = data.get("effects", {}).get("gasUsed", {})
    created = [o for o in changes if o.get("type") in ("created", "published")]
    shared = [o for o in changes if o.get("type") == "created" and isinstance(o.get("owner"), dict) and "Shared" in o.get("owner", {})]

    return {
        "packageId": package_id,
        "upgradeCapId": upgrade_cap_id,
        "graduationRegistryId": graduation_registry_id,
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


def parse_upgrade_output(data: dict, existing_config: dict) -> dict:
    """Parse upgrade output and merge with existing config."""
    changes = data.get("objectChanges", [])

    new_package_id = None
    for obj in changes:
        if obj.get("type") == "published":
            new_package_id = obj.get("packageId")
            break

    if not new_package_id:
        error("No new package ID found in upgrade output")
        print(json.dumps(data, indent=2), file=sys.stderr)
        sys.exit(1)

    gas = data.get("effects", {}).get("gasUsed", {})

    return {
        "packageId": new_package_id,
        "upgradeCapId": existing_config.get("upgradeCapId"),
        "originalPackageId": existing_config.get("originalPackageId") or existing_config.get("packageId"),
        "graduationRegistryId": existing_config.get("graduationRegistryId") or "",
        "deploymentTx": data.get("digest"),
        "previousPackageId": existing_config.get("packageId"),
        "upgradeCount": existing_config.get("upgradeCount", 0) + 1,
        "gasUsed": {
            "computationCost": gas.get("computationCost"),
            "storageCost": gas.get("storageCost"),
            "storageRebate": gas.get("storageRebate"),
            "nonRefundableStorageFee": gas.get("nonRefundableStorageFee"),
        },
    }


# ---------------------------------------------------------------------------
# .env.local sync
# ---------------------------------------------------------------------------

def update_env_local(project_root: Path, deployment: dict) -> None:
    """Update .env.local with the deployed contract addresses."""
    env_file = project_root / ".env.local"
    if not env_file.exists():
        return

    content = env_file.read_text()

    replacements = {
        "VITE_SUI_NETWORK": deployment.get("network") or "",
        "VITE_MAX_SUPPLY": str(deployment.get("maxSupply") or ""),
    }

    for key, value in replacements.items():
        pattern = rf"^{re.escape(key)}=.*$"
        replacement = f"{key}={value}"
        if re.search(pattern, content, flags=re.MULTILINE):
            content = re.sub(pattern, replacement, content, flags=re.MULTILINE)
        else:
            if not content.endswith("\n"):
                content += "\n"
            content += f"{replacement}\n"

    env_file.write_text(content)
    info(f"Updated .env.local")


# ---------------------------------------------------------------------------
# Main deployment flow
# ---------------------------------------------------------------------------

def deploy(network: str, force_fresh: bool = False, dry_run: bool = False) -> None:
    """Deploy or upgrade Cord contracts to the specified network."""
    t0 = time.monotonic()

    project_root = Path(__file__).resolve().parent.parent
    contract_dir = project_root / "contracts" / "cord"
    deployment_file = project_root / "public" / f"deployment-{network}.json"

    net_config = NETWORKS.get(network, NETWORKS["local"])
    runtime_cfg = load_network_runtime_config(contract_dir, network)
    max_supply = resolve_max_supply(runtime_cfg)
    graduation_threshold = max_supply
    runtime_move_path = write_runtime_config_move(contract_dir, max_supply)

    # Prerequisite checks (always run, even for --dry-run)
    check_prerequisites(network)

    # Check for existing deployment
    existing_config = load_existing_deployment(deployment_file)
    upgrade_cap_id = existing_config.get("upgradeCapId") if existing_config else None

    is_upgrade = bool(upgrade_cap_id) and not force_fresh

    mode = "upgrade" if is_upgrade else "fresh deploy"
    header(f"{mode.upper()}  ·  {network}")

    if is_upgrade:
        info(f"Upgrading Cord on {network} (preserving packageId and user markets)")
        label_value("upgrade cap", upgrade_cap_id)
    else:
        info(f"Fresh deployment of Cord to {network}")
        if existing_config and not force_fresh:
            warn("No UpgradeCap found. This will create a NEW package.")
            warn("Existing user markets will NOT be accessible!")
            response = input("  Continue? [y/N]: ")
            if response.lower() != "y":
                print("  Aborted.")
                sys.exit(0)
    label_value("max supply", str(max_supply))
    label_value("graduation threshold", f"{graduation_threshold} (derived from max supply)")
    label_value("runtime config", str(runtime_move_path))

    print()

    # --dry-run: stop here
    if dry_run:
        success("Dry run complete — prerequisites OK, would proceed with " + mode)
        if is_upgrade:
            info(f"Would upgrade package using UpgradeCap {upgrade_cap_id}")
        else:
            info(f"Would publish new package on {network}")
        return

    # Switch network
    info("Switching network...")
    switch_network(network)

    # Clean build artifacts
    info("Cleaning build artifacts...")
    clean_build(contract_dir, network, keep_pub_file=is_upgrade)

    # For upgrades on dev networks, verify chain-id hasn't changed
    if is_upgrade:
        check_chain_id(contract_dir, network)

    if is_upgrade:
        # Verify Pub file exists (required by CLI for upgrades)
        if network != "mainnet":
            pub_file = contract_dir / f"Pub.{network}.toml"
            if not pub_file.exists():
                error(f"Pub.{network}.toml is missing")
                print()
                print(f"  This file is required for upgrades. It was created during")
                print(f"  the initial test-publish and must not be deleted.")
                print()
                info(f"To deploy fresh (loses existing user markets):")
                print(f"  python scripts/deploy.py {network} --fresh")
                sys.exit(1)

        sync_move_toml_package_id(contract_dir, existing_config["packageId"])
        info(f"Upgrading package...")
        output = upgrade_contracts(contract_dir, network, upgrade_cap_id)
        deployment = parse_upgrade_output(output, existing_config)
    else:
        info(f"Publishing to {network}...")
        output = publish_contracts(contract_dir, network)
        deployment = parse_publish_output(output)

    sync_move_toml_package_id(contract_dir, deployment["packageId"])

    # Get deployer
    deployer = get_active_address()

    # Build config
    config = {
        "network": network,
        "rpcUrl": net_config.rpc_url,
        "explorerUrl": net_config.explorer_url,
        "maxSupply": max_supply,
        **deployment,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "deployer": deployer,
        "status": "deployed",
        "isUpgrade": is_upgrade,
    }

    # Save deployment JSON
    deployment_file.parent.mkdir(parents=True, exist_ok=True)
    deployment_file.write_text(json.dumps(config, indent=2) + "\n")

    # Sync .env.local
    update_env_local(project_root, config)

    elapsed = time.monotonic() - t0

    # --- Summary ---
    header(f"{'Upgrade' if is_upgrade else 'Deployment'} successful!")

    label_value("network", network)
    label_value("package ID", deployment["packageId"])

    if is_upgrade:
        label_value("original package", deployment.get("originalPackageId", "—"))
        label_value("previous package", deployment.get("previousPackageId", "—"))
        label_value("upgrade count", str(deployment.get("upgradeCount", 1)))

    label_value("upgrade cap", deployment.get("upgradeCapId", "—"))
    label_value("graduation registry", deployment.get("graduationRegistryId", "—"))
    label_value("transaction", deployment["deploymentTx"])
    label_value("deployer", deployer)

    # Gas
    gas = deployment.get("gasUsed", {})
    total_gas = (
        int(gas.get("computationCost", 0))
        + int(gas.get("storageCost", 0))
        - int(gas.get("storageRebate", 0))
    )
    label_value("gas used", mist_to_sui(total_gas))

    label_value("time", f"{elapsed:.1f}s")

    # Explorer link
    digest = deployment["deploymentTx"]
    explorer_link = f"{net_config.explorer_url}/tx/{digest}"
    print()
    print(f"  {bold('Explorer:')} {explorer_link}")

    print()
    label_value("config saved to", str(deployment_file))

    # Post-deploy notes
    print()
    if is_upgrade:
        success("User markets have been preserved.")
    else:
        if network != "mainnet":
            pub_file = contract_dir / f"Pub.{network}.toml"
            warn(f"Do NOT delete {pub_file.name} — required for future upgrades on {network}.")
        warn("Save your UpgradeCap ID — without it you cannot upgrade.")

    print()
    info("Restart your dev server to load the new config:")
    print(f"  npm run dev")
    print()


def main() -> None:
    if "-fresh" in sys.argv:
        sys.argv = [arg if arg != "-fresh" else "--fresh" for arg in sys.argv]

    parser = argparse.ArgumentParser(
        description="Deploy or upgrade Cord contracts to Sui network",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python deploy.py devnet            # Deploy or upgrade to devnet
  python deploy.py testnet           # Deploy or upgrade to testnet
  python deploy.py devnet --fresh    # Force fresh deployment (loses user markets!)
  python deploy.py devnet --dry-run  # Check prerequisites without deploying
        """
    )
    parser.add_argument(
        "network",
        nargs="?",
        default="testnet",
        choices=["devnet", "testnet", "mainnet", "local"],
        help="Target network (default: testnet)",
    )
    parser.add_argument(
        "--fresh",
        action="store_true",
        help="Force fresh deployment instead of upgrade (WARNING: loses user markets!)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Check prerequisites and show what would happen without deploying",
    )
    args = parser.parse_args()
    deploy(args.network, force_fresh=args.fresh, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
