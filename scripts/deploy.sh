#!/bin/bash
# MemeFlow Contract Deployment Script

set -e

NETWORK="${1:-devnet}"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONTRACT_DIR="$PROJECT_ROOT/contracts/memeflow"
DEPLOYMENT_FILE="$PROJECT_ROOT/public/deployment-$NETWORK.json"

echo "🚀 Deploying MemeFlow to $NETWORK"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Switch to correct network
sui client switch --env "$NETWORK" 2>/dev/null || sui client new-env --alias "$NETWORK" --rpc "https://fullnode.$NETWORK.sui.io:443"

# Build and publish
cd "$CONTRACT_DIR"
echo "Building contracts..."

# Clean build cache if it exists
if [ -d "build" ]; then
    echo "Cleaning previous build..."
    rm -rf build
fi

sui move build

echo "Publishing to $NETWORK..."
PUBLISH_LOG="$PROJECT_ROOT/.publish-$NETWORK.log"
sui client publish --gas-budget 500000000 --json > "$PUBLISH_LOG" 2>&1
JSON_OUTPUT=$(awk 'BEGIN{p=0} /^\s*\{/ {p=1} {if (p) print}' "$PUBLISH_LOG")

if [ -z "$JSON_OUTPUT" ]; then
  echo "❌ Deployment failed: no JSON output found"
  echo "Publish logs:"
  cat "$PUBLISH_LOG"
  exit 1
fi

if ! printf '%s\n' "$JSON_OUTPUT" | jq -e . >/dev/null 2>&1; then
  echo "❌ Deployment failed: invalid JSON output"
  echo "Publish logs:"
  cat "$PUBLISH_LOG"
  exit 1
fi

# Parse output
PACKAGE_ID=$(echo "$JSON_OUTPUT" | jq -r '.objectChanges[] | select(.type == "published") | .packageId' 2>/dev/null)
TX_DIGEST=$(echo "$JSON_OUTPUT" | jq -r '.digest' 2>/dev/null)

if [ -z "$PACKAGE_ID" ]; then
    echo "❌ Deployment failed"
    echo "$OUTPUT"
    exit 1
fi

# Extract shared objects
PROFILE_REGISTRY=$(echo "$JSON_OUTPUT" | jq -r '.objectChanges[] | select((.objectType // "") | contains("ProfileRegistry")) | .objectId' 2>/dev/null)
FACTORY=$(echo "$JSON_OUTPUT" | jq -r '.objectChanges[] | select((.objectType // "") | contains("Factory")) | .objectId' 2>/dev/null)

# Extract gas costs
COMPUTATION_COST=$(echo "$JSON_OUTPUT" | jq -r '.effects.gasUsed.computationCost' 2>/dev/null)
STORAGE_COST=$(echo "$JSON_OUTPUT" | jq -r '.effects.gasUsed.storageCost' 2>/dev/null)
STORAGE_REBATE=$(echo "$JSON_OUTPUT" | jq -r '.effects.gasUsed.storageRebate' 2>/dev/null)
NON_REFUNDABLE=$(echo "$JSON_OUTPUT" | jq -r '.effects.gasUsed.nonRefundableStorageFee' 2>/dev/null)

# Get deployer address
DEPLOYER=$(sui client active-address 2>/dev/null)

# Set RPC and Explorer URLs based on network
if [ "$NETWORK" = "devnet" ]; then
  RPC_URL="https://fullnode.devnet.sui.io:443"
  EXPLORER_URL="https://suiscan.xyz/devnet"
elif [ "$NETWORK" = "testnet" ]; then
  RPC_URL="https://fullnode.testnet.sui.io:443"
  EXPLORER_URL="https://suiscan.xyz/testnet"
elif [ "$NETWORK" = "mainnet" ]; then
  RPC_URL="https://fullnode.mainnet.sui.io:443"
  EXPLORER_URL="https://suiscan.xyz/mainnet"
else
  RPC_URL="http://127.0.0.1:9000"
  EXPLORER_URL="http://localhost:3000"
fi

# Count created objects
CREATED_OBJECTS=$(echo "$JSON_OUTPUT" | jq '[.objectChanges[] | select(.type == "created" or .type == "published")] | length' 2>/dev/null)
SHARED_OBJECTS=$(echo "$JSON_OUTPUT" | jq '[.objectChanges[] | select(.type == "created") | select((.owner | type) == "object" and (.owner | has("Shared")))] | length' 2>/dev/null)

# Save deployment config with comprehensive metadata
mkdir -p "$PROJECT_ROOT/public"
cat > "$DEPLOYMENT_FILE" << EOF
{
  "network": "$NETWORK",
  "rpcUrl": "$RPC_URL",
  "explorerUrl": "$EXPLORER_URL",
  "packageId": "$PACKAGE_ID",
  "profileRegistryId": "$PROFILE_REGISTRY",
  "factoryId": "$FACTORY",
  "deploymentTx": "$TX_DIGEST",
  "timestamp": "$(date -Iseconds)",
  "deployer": "$DEPLOYER",
  "gasUsed": {
    "computationCost": "$COMPUTATION_COST",
    "storageCost": "$STORAGE_COST",
    "storageRebate": "$STORAGE_REBATE",
    "nonRefundableStorageFee": "$NON_REFUNDABLE"
  },
  "status": "deployed",
  "sharedObjectsCreated": $SHARED_OBJECTS,
  "totalObjectsCreated": $CREATED_OBJECTS
}
EOF

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Deployment successful!"
echo ""
echo "Network:            $NETWORK"
echo "Package ID:         $PACKAGE_ID"
echo "Profile Registry:   $PROFILE_REGISTRY"
echo "Factory:            $FACTORY"
echo "Transaction:        $TX_DIGEST"
echo "Deployer:           $DEPLOYER"
echo ""
echo "Config saved to:    $DEPLOYMENT_FILE"
echo ""
echo "⚠️  Important: Restart your dev server to load the new deployment config!"
echo "   Run: npm run dev"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
