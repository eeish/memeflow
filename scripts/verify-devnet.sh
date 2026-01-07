#!/bin/bash
# MemeFlow Deployment Verification Script
# Generated: 2025-11-17T23:24:54.256Z
# Network: devnet

echo "Verifying MemeFlow deployment on devnet..."
echo ""

# Package
echo "Package ID: 0x5e60863e57204f2a2635fe799ab4e5b792ba6d487d1eaf723abecfa7ee49a19f"
sui client object 0x5e60863e57204f2a2635fe799ab4e5b792ba6d487d1eaf723abecfa7ee49a19f --json | jq '.data.type' || echo "Failed to verify package"
echo ""

# Profile Registry
echo "Profile Registry ID: 0xe5e152b3e6c7a29472007cfc40590cb0ea5d6317b2ebcc8ed7072a4c731fa265"
sui client object 0xe5e152b3e6c7a29472007cfc40590cb0ea5d6317b2ebcc8ed7072a4c731fa265 --json | jq '.data.type' || echo "Failed to verify profile registry"
echo ""

# Factory
echo "Factory ID: 0x415f3576fdb53312e721ab4f520fd74767470431db3b8d369b195edb817d28d4"
sui client object 0x415f3576fdb53312e721ab4f520fd74767470431db3b8d369b195edb817d28d4 --json | jq '.data.type' || echo "Failed to verify factory"
echo ""

echo "Transaction: WqivUj5S3DVtZAisY6te1SPtr2Nd8vSahmKYWEFs72r"
echo "Explorer: https://suiscan.xyz/devnet/tx/WqivUj5S3DVtZAisY6te1SPtr2Nd8vSahmKYWEFs72r"
