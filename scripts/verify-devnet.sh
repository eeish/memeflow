#!/bin/bash
# MemeFlow Deployment Verification Script
# Generated: 2025-08-26T08:52:54.332Z
# Network: devnet

echo "Verifying MemeFlow deployment on devnet..."
echo ""

# Package
echo "Package ID: 0x95e3f7ecaea5de9d9bb5b3f7b1883ce647f133afcd77433a2ea5bf5191985c56"
sui client object 0x95e3f7ecaea5de9d9bb5b3f7b1883ce647f133afcd77433a2ea5bf5191985c56 --json | jq '.data.type' || echo "Failed to verify package"
echo ""

# Profile Registry
# No Profile Registry deployed

# Factory
# No Factory deployed

echo "Transaction: CVhozg2nyDajoTRZctAqttk3GsdHJ7DdTH3UatYZgDk3"
echo "Explorer: https://suiscan.xyz/devnet/tx/CVhozg2nyDajoTRZctAqttk3GsdHJ7DdTH3UatYZgDk3"
