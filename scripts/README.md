# MemeFlow Scripts

Minimal scripts for deploying and managing MemeFlow contracts and services.

## Shell Scripts

### deploy.sh
Deploy contracts to Sui network.
```bash
./scripts/deploy.sh [network]    # network: devnet (default), testnet, mainnet
```

### reset.sh
Reset the database.
```bash
./scripts/reset.sh
```

## Python Scripts

### reset_database.py
Advanced database reset with service management.
```bash
python3 scripts/reset_database.py [--check|--no-restart|--force|--verbose]
```

### verify.py
Verify deployment on-chain.
```bash
python3 scripts/verify.py [network]    # network: devnet (default), testnet, mainnet
```

### test.py
Run deployment and environment tests.
```bash
python3 scripts/test.py [all|env|profile|deploy]
```

### network.py
Manage local Sui network.
```bash
python3 scripts/network.py [start|stop|status]
```

## Quick Reference

```bash
# Deploy to devnet
./scripts/deploy.sh devnet

# Verify deployment
python3 scripts/verify.py devnet

# Reset database
./scripts/reset.sh

# Start local network
python3 scripts/network.py start
```