# MemeFlow Smart Contracts

A unified smart contract architecture for creating and managing meme tokens on the Sui blockchain, similar to Pumpfun's gas-efficient approach.

## 🏗 Architecture Overview

### Core Contracts

1. **MemeTokenFactory** (`memeflow::meme_token_factory`)
   - Central factory for creating all meme tokens
   - Manages bonding curve trading
   - Handles token graduation to AMM pools
   - Collects platform fees

2. **Dynamic Token System** (`memeflow::dynamic_token`)
   - Creates unique token types for each meme
   - Manages treasury capabilities
   - Token registry and metadata

3. **AMM Pool** (`memeflow::amm_pool`)
   - Constant product AMM for graduated tokens
   - Liquidity provision and trading
   - LP token management

4. **Integration Utils** (`memeflow::integration`)
   - Frontend integration functions
   - User registration -> token creation flow
   - Utility functions for UI

## 🚀 Key Features

### ✅ Pumpfun-Style Architecture
- **Single Factory Contract**: All tokens created through one contract
- **Gas Efficient**: Reduced deployment costs per token
- **Bonding Curve Trading**: Linear bonding curve with configurable parameters
- **Automatic Graduation**: Tokens graduate to AMM at 69 SUI raised
- **Platform Fees**: 1% trading fees for sustainability

### ✅ Advanced Features
- **Dynamic Token Creation**: Each token has unique type
- **AMM Integration**: Constant product pools for graduated tokens
- **Liquidity Provision**: LP tokens and yield farming ready
- **Event System**: Comprehensive event emission for indexing
- **Admin Controls**: Factory management and emergency functions

## 📊 Token Economics

### Creation Parameters
- **Creation Fee**: 1 SUI per token
- **Initial Supply**: 1 billion tokens (18 decimals)
- **Graduation Target**: 69 SUI raised
- **Trading Fee**: 1% (100 basis points)

### Bonding Curve
- **Formula**: Linear bonding curve for simplicity
- **Starting Price**: Dynamic based on supply
- **Price Discovery**: Market-driven through trading
- **Graduation**: Automatic AMM pool creation

## 🛠 Development Setup

### Prerequisites
- Sui CLI installed and configured
- Node.js 18+ for deployment scripts
- TypeScript for frontend integration

### Build Contracts
```bash
# Build MemeFlow contracts
npm run contract:build

# Build legacy todo contracts
npm run contract:build:todo

# Clean build artifacts
npm run contract:clean

# Format Move code
npm run contract:fmt
```

### Deploy Contracts
```bash
# Deploy to testnet (recommended)
npm run contract:deploy:testnet

# Deploy to devnet
npm run contract:deploy:devnet

# Deploy to local network
npm run contract:deploy:local
```

## 📡 Network Configuration

### Testnet (Recommended)
- **RPC**: `https://fullnode.testnet.sui.io:443`
- **Explorer**: `https://suiscan.xyz/testnet`
- **Faucet**: `https://faucet.testnet.sui.io`

### Devnet
- **RPC**: `https://fullnode.devnet.sui.io:443`
- **Explorer**: `https://suiscan.xyz/devnet`

### Local Network
- **RPC**: `http://127.0.0.1:9000`
- **Setup**: `sui start --with-faucet`

## 🔧 Frontend Integration

### TypeScript SDK
```typescript
import { createMemeFlowContracts } from './lib/contracts';

// Initialize contracts
const contracts = await createMemeFlowContracts('testnet');

// Create token for new user
const result = await contracts.createUserToken(
  signer,
  {
    username: 'cooluser',
    displayName: 'Cool User',
    bio: 'Building the future of memes',
    avatarUrl: 'https://example.com/avatar.jpg'
  }
);
```

### React Hooks
```typescript
import { useCreateToken, useTokenInfo } from './hooks/useContracts';

function TokenCreation() {
  const { createToken, creating } = useCreateToken();
  const { tokenInfo } = useTokenInfo('COOLUSER');

  const handleCreate = async () => {
    const result = await createToken({
      username: 'cooluser',
      displayName: 'Cool User'
    });
    
    if (result.success) {
      console.log('Token created:', result.transactionHash);
    }
  };
}
```

## 📋 API Reference

### Core Functions

#### Create Token
```move
public entry fun create_meme_token(
    factory: &mut MemeTokenFactory,
    payment: Coin<SUI>,
    symbol: vector<u8>,
    name: vector<u8>,
    description: vector<u8>,
    image_url: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext
)
```

#### Buy Tokens
```move
public entry fun buy_tokens(
    factory: &mut MemeTokenFactory,
    symbol: vector<u8>,
    payment: Coin<SUI>,
    min_tokens_out: u64,
    clock: &Clock,
    ctx: &mut TxContext
)
```

#### Sell Tokens
```move
public entry fun sell_tokens(
    factory: &mut MemeTokenFactory,
    symbol: vector<u8>,
    token_amount: u64,
    min_sui_out: u64,
    clock: &Clock,
    ctx: &mut TxContext
)
```

### Integration Functions

#### User Registration Flow
```move
public entry fun create_user_token(
    factory: &mut MemeTokenFactory,
    payment: Coin<SUI>,
    username: vector<u8>,
    display_name: vector<u8>,
    bio: vector<u8>,
    avatar_url: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext
)
```

## 🔍 Event System

### Token Events
- `TokenCreated`: New token launched
- `TokenPurchased`: Tokens bought from bonding curve
- `TokenSold`: Tokens sold back to bonding curve
- `TokenGraduated`: Token moved to AMM pool

### Pool Events
- `PoolCreated`: New AMM pool created
- `Swap`: Token swap in AMM pool
- `LiquidityAdded`: LP tokens minted
- `LiquidityRemoved`: LP tokens burned

## 🛡 Security Features

### Access Controls
- **Factory Owner**: Can update fees and withdraw platform fees
- **Pool Creator**: Can pause/unpause pools in emergencies
- **Treasury Caps**: Securely managed for token minting

### Safety Mechanisms
- **Slippage Protection**: Minimum output amounts
- **Fee Validation**: Prevents excessive fees
- **Address Validation**: Sui address format checks
- **Supply Limits**: Maximum token supply constraints

## 🧪 Testing

### Unit Tests
```bash
# Test contract compilation
npm run contract:build

# Run Move unit tests
cd contracts/memeflow && sui move test

# Run integration tests
npm run contract:test
```

### Frontend Testing
```bash
# TypeScript type checking
npm run typecheck

# Lint contracts integration
npm run lint

# Full test suite
npm run test
```

## 📈 Monitoring and Analytics

### On-Chain Data
- **Factory Stats**: Total tokens created, fees collected
- **Token Metrics**: Supply, holders, volume, price
- **Pool Analytics**: Liquidity, volume, fees earned
- **User Activity**: Creation, trading, LP provision

### Event Indexing
All contract events can be indexed for:
- Real-time price feeds
- Trading volume analytics
- User activity tracking
- Platform revenue monitoring

## 🔮 Future Enhancements

### Phase 1 (Current)
- [x] Factory contract with bonding curve
- [x] Dynamic token creation
- [x] AMM pools for graduated tokens
- [x] Frontend integration

### Phase 2 (Planned)
- [ ] Advanced bonding curve formulas
- [ ] Cross-chain token bridging
- [ ] Governance token and DAO
- [ ] NFT integration for token avatars

### Phase 3 (Future)
- [ ] Yield farming and staking
- [ ] Options and derivatives
- [ ] Multi-token basket creation
- [ ] AI-powered token recommendations

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Write tests for your changes
4. Commit your changes (`git commit -m 'Add amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.

## 🙏 Acknowledgments

- [Sui Foundation](https://sui.io/) - Blockchain platform
- [Pumpfun](https://pump.fun/) - Architecture inspiration
- [Uniswap](https://uniswap.org/) - AMM design patterns
- [OpenZeppelin](https://openzeppelin.com/) - Security best practices

---

<div align="center">
Built with ❤️ for the meme economy on Sui 🚀
</div>