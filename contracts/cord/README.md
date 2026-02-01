# Cord Smart Contracts

## Contract Structure

### Active Contracts (Social Features)
These contracts are currently deployed and actively used:

1. **`social_follow.move`** ✅ ACTIVE
   - Core social following functionality using Friend.tech bonding curve model
   - Implements follow/unfollow with quadratic pricing (S²/16000 SUI)
   - Manages FollowBook and Market objects
   - Provides 7 free follows for new users

2. **`cord_social.move`** ✅ ACTIVE
   - Integration layer between Cord and social following
   - Manages CordProfile with additional metadata
   - Handles batch operations and enhanced tracking

### Token Trading Contracts (Future Implementation)
These contracts are included but not yet integrated with the frontend:

3. **`meme_token_factory.move`** 🚧 PLANNED
   - Factory pattern for creating meme tokens
   - Implements bonding curve for token launches
   - Manages graduation to AMM pools
   - Status: Contract ready, frontend integration pending

4. **`amm_pool.move`** 🚧 PLANNED
   - Automated Market Maker for graduated tokens
   - Implements constant product formula (x*y=k)
   - Manages liquidity pools and LP tokens
   - Status: Contract ready, frontend integration pending

## Removed Contracts

The following contracts were removed as they were unused:

- **`dynamic_token.move`** - Not integrated, functionality covered by factory
- **`deploy_utils.move`** - Deployment utilities, not needed after initial setup

## Deployment Status

- **Devnet**: ✅ Deployed (social contracts only)
  - Package ID: `0x5e60863e57204f2a2635fe799ab4e5b792ba6d487d1eaf723abecfa7ee49a19f`
  - Social features are fully functional

- **Testnet**: ⏳ Not deployed
- **Mainnet**: ⏳ Not deployed

## Building Contracts

```bash
# Build all contracts
npm run contract:build

# Deploy to devnet
npm run contract:deploy:devnet

# Deploy to testnet
npm run contract:deploy:testnet
```

## Contract Dependencies

```
social_follow.move (standalone)
    ↑
cord_social.move (depends on social_follow)

meme_token_factory.move (standalone)
    ↑
amm_pool.move (works with factory for graduated tokens)
```

## Usage Notes

1. **Social Features**: Currently active and integrated
   - Users can create profiles
   - Follow/unfollow with bonding curve pricing
   - First 7 follows are free

2. **Token Trading**: Contracts ready but not integrated
   - Token creation and trading logic implemented
   - AMM pools for graduated tokens ready
   - Frontend integration needed for activation

## Testing

All contracts have been tested for compilation and basic functionality. Integration testing with frontend is ongoing for social features.
