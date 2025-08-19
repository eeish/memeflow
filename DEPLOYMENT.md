# MemeFlow Deployment Guide

This guide covers the optimized deployment system for MemeFlow smart contracts, which automatically updates all configuration files to ensure seamless frontend integration.

## 🚀 Quick Start

### 1. Deploy to Testnet (Recommended)

```bash
npm run contract:deploy:testnet
```

This single command will:
- Build the Move contracts
- Deploy to Sui testnet
- Initialize the factory
- Update all configuration files
- Verify the deployment
- Test frontend integration

### 2. Start Development

```bash
npm run dev
```

Your frontend is now ready to interact with the deployed contracts!

## 📋 Available Commands

### Deployment Commands

```bash
# Deploy to different networks
npm run contract:deploy:local      # Local Sui network
npm run contract:deploy:devnet     # Sui devnet
npm run contract:deploy:testnet    # Sui testnet (recommended)

# Force redeploy (overwrites existing)
npm run contract:deploy:force

# Update configuration files only
npm run contract:update-configs

# Verify existing deployment
npm run contract:verify
```

### Testing Commands

```bash
# Test deployed contracts
npm run contract:test              # Test on testnet
npm run contract:test:local        # Test local deployment
npm run contract:test:devnet       # Test devnet deployment

# Contract development
npm run contract:build             # Build contracts
npm run contract:clean             # Clean build artifacts
```

## 🔧 Deployment Features

### Automatic Configuration Updates

The optimized deployment script automatically updates:

1. **Public Deployment Files**: `public/deployment-{network}.json`
2. **TypeScript Config**: `src/lib/config.ts`
3. **Environment Files**: `.env.local`, `.env.example`
4. **Package Scripts**: Ready-to-use npm commands

### Smart Configuration Management

- **Network-specific configs**: Separate configs for each network
- **Environment variable integration**: Vite env vars automatically set
- **Fallback mechanisms**: JSON files as backup if TypeScript config fails
- **Type safety**: Full TypeScript support with proper types

### Comprehensive Validation

- ✅ Contract object existence verification
- ✅ Function call testing
- ✅ Gas usage validation
- ✅ Frontend integration testing
- ✅ Network connectivity checks
- ✅ Configuration format validation

## 📁 Generated Files

### 1. TypeScript Configuration (`src/lib/config.ts`)

```typescript
import { CURRENT_DEPLOYMENT, getConfigStatus } from './lib/config';

// Automatically updated with deployed addresses
console.log(CURRENT_DEPLOYMENT.packageId);
console.log(CURRENT_DEPLOYMENT.factoryId);

// Built-in validation
const status = getConfigStatus();
console.log('Deployment ready:', status.deploymentReady);
```

### 2. Environment Variables (`.env.local`)

```bash
# Automatically updated
VITE_SUI_NETWORK=testnet
VITE_PACKAGE_ID=0xabc123...
VITE_FACTORY_ID=0xdef456...
VITE_EXPLORER_URL=https://suiscan.xyz/testnet
```

### 3. Deployment Files (`public/deployment-{network}.json`)

```json
{
  "network": "testnet",
  "packageId": "0xabc123...",
  "factoryId": "0xdef456...",
  "rpcUrl": "https://fullnode.testnet.sui.io:443",
  "verified": true,
  "timestamp": "2025-08-10T12:00:00.000Z"
}
```

## 🔍 Deployment Process

### Phase 1: Preparation
- Creates backup of existing deployment
- Validates network configuration
- Cleans previous build artifacts

### Phase 2: Contract Build & Deploy
- Builds Move contracts with optimizations
- Deploys to target network
- Extracts package and object IDs

### Phase 3: Initialization
- Calls `initialize_memeflow()` function
- Creates factory shared object
- Sets up pool creation capabilities

### Phase 4: Configuration Update
- Updates TypeScript configuration files
- Sets environment variables
- Updates JSON deployment files

### Phase 5: Verification
- Tests contract object existence
- Validates function calls
- Checks gas usage
- Tests frontend integration

### Phase 6: Reporting
- Generates deployment report
- Creates explorer links
- Provides next steps

## 🛠️ Configuration Files

### Network Configuration

The system supports multiple networks with automatic switching:

```typescript
// src/lib/config.ts
export const NETWORKS = {
  local: {
    rpc: 'http://127.0.0.1:9000',
    explorer: 'http://localhost:3000',
    faucet: 'http://127.0.0.1:9123'
  },
  testnet: {
    rpc: 'https://fullnode.testnet.sui.io:443', 
    explorer: 'https://suiscan.xyz/testnet',
    faucet: 'https://faucet.testnet.sui.io'
  }
  // ... more networks
};
```

### Contract Address Management

```typescript
// Automatic address resolution
export const CONTRACT_IDS = {
  get packageId() {
    return getEnvConfig().packageId;
  },
  get factoryId() {
    return getEnvConfig().factoryId;
  }
};
```

## 🧪 Testing Integration

### Automated Testing

The deployment includes comprehensive testing:

```bash
npm run contract:test
```

Tests include:
- ✅ Network connectivity
- ✅ Contract existence
- ✅ Function calls
- ✅ Gas optimization
- ✅ Frontend integration
- ✅ Configuration validation
- ✅ Performance benchmarks

### Manual Testing

```typescript
// Test contracts in your app
import { createMemeFlowContracts } from './lib/contracts';

const contracts = await createMemeFlowContracts('testnet');
const stats = await contracts.getFactoryStats();
console.log('Factory stats:', stats);
```

## 🔧 Troubleshooting

### Common Issues

#### 1. "Package object does not exist"
**Solution**: Deploy contracts first
```bash
npm run contract:deploy:testnet
```

#### 2. "Deployment file not found"
**Solution**: Update configurations
```bash
npm run contract:update-configs
```

#### 3. "Invalid network configuration"
**Solution**: Verify network settings
```bash
npm run contract:verify
```

#### 4. Frontend can't connect to contracts
**Solution**: Check environment variables
```bash
# Verify .env.local has correct values
cat .env.local | grep VITE_
```

### Debug Mode

Enable verbose deployment logging:

```bash
DEBUG=true npm run contract:deploy:testnet
```

### Reset Deployment

To start fresh:

```bash
# Clean all build artifacts
npm run contract:clean

# Force redeploy
npm run contract:deploy:force
```

## 📊 Monitoring & Analytics

### Explorer Links

The deployment automatically generates explorer links:

- **Package**: `https://suiscan.xyz/testnet/object/{packageId}`
- **Factory**: `https://suiscan.xyz/testnet/object/{factoryId}`
- **Transactions**: `https://suiscan.xyz/testnet/txblock/{txHash}`

### Gas Usage Tracking

Monitor gas costs in deployment reports:

```json
{
  "gasUsed": {
    "computationCost": "1000000",
    "storageCost": "2000000", 
    "storageRebate": "500000"
  }
}
```

### Performance Metrics

Track deployment performance:

- Build time
- Deployment time
- Verification time
- Total deployment duration

## 🚦 Network-Specific Setup

### Local Development

```bash
# Start local Sui network
sui start --with-faucet

# Deploy to local
npm run contract:deploy:local

# Start frontend
npm run dev
```

### Testnet (Recommended)

```bash
# Deploy to testnet
npm run contract:deploy:testnet

# Start frontend
npm run dev
```

### Mainnet (Production)

```bash
# Ensure thorough testing first
npm run contract:test:testnet

# Deploy to mainnet (be careful!)
npm run contract:deploy:mainnet
```

## 🔐 Security Considerations

### Before Mainnet Deployment

1. **Comprehensive Testing**: Run full test suite
2. **Security Audit**: Review contract code
3. **Gas Optimization**: Minimize deployment costs
4. **Access Controls**: Verify admin permissions
5. **Backup Strategy**: Ensure rollback capability

### Production Checklist

- [ ] All tests passing
- [ ] Security audit completed
- [ ] Gas costs optimized
- [ ] Admin keys secured
- [ ] Monitoring setup
- [ ] Documentation updated
- [ ] Emergency procedures defined

## 📚 Integration Examples

### React Hook Integration

```typescript
// src/hooks/useDeployment.ts
import { useEffect, useState } from 'react';
import { getConfigStatus } from '../lib/config';

export function useDeployment() {
  const [status, setStatus] = useState(getConfigStatus());
  
  useEffect(() => {
    setStatus(getConfigStatus());
  }, []);
  
  return {
    isReady: status.deploymentReady,
    network: status.network,
    contracts: status.contracts
  };
}
```

### Contract Interaction

```typescript
// src/utils/contractHelpers.ts
import { createMemeFlowContracts } from '../lib/contracts';
import { CURRENT_NETWORK } from '../lib/config';

export async function getFactoryStats() {
  const contracts = await createMemeFlowContracts(CURRENT_NETWORK);
  return await contracts.getFactoryStats();
}
```

## 🎯 Best Practices

### Development Workflow

1. **Local Testing**: Use local network for development
2. **Testnet Staging**: Deploy to testnet for integration testing  
3. **Mainnet Production**: Only after thorough validation

### Configuration Management

1. **Environment Separation**: Different configs per network
2. **Automatic Updates**: Let deployment script handle configs
3. **Manual Overrides**: Use `.env.local` for custom values
4. **Version Control**: Track deployment configurations

### Monitoring

1. **Health Checks**: Regular contract functionality tests
2. **Gas Monitoring**: Track deployment and transaction costs
3. **Performance Tracking**: Monitor response times
4. **Error Handling**: Graceful failure handling

---

## 🔗 Next Steps

After successful deployment:

1. **Start Development**: `npm run dev`
2. **Create Test Token**: Use the UI to test token creation
3. **Monitor Transactions**: Check explorer links
4. **Set Up Monitoring**: Track contract events
5. **Plan Production**: Prepare for mainnet deployment

For additional help, see:
- [Contract Documentation](./contracts/README.md)
- [Frontend Integration Guide](./src/lib/contracts.ts)
- [Troubleshooting Guide](#troubleshooting)