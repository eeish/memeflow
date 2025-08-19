# MemeFlow Social Follow Smart Contract Documentation

## Overview

The MemeFlow Social Follow system implements a decentralized social graph with economic incentives using a quadratic bonding curve pricing model similar to Friend.tech. The system consists of two main modules:

1. **social_follow.move** - Core following mechanics with bonding curve
2. **memeflow_social.move** - Integration layer for MemeFlow ecosystem

## Key Features

### 🔄 Follow/Unfollow with Economic Model
- **Follow = Buy Key**: Following someone requires purchasing their "key" 
- **Unfollow = Sell Key**: Unfollowing returns funds based on current supply
- **Price Formula**: `price = S² / 16000` (in SUI), where S is current supply

### 💰 Quadratic Bonding Curve
- Early followers pay less, creating incentive for discovery
- Price increases quadratically as more people follow
- Creates economic value for popular creators
- Enables speculation on creator popularity

### 🎁 Sponsored Follows
- First 7 follows for new users are FREE (gas-sponsored)
- Encourages onboarding and exploration
- No Coin<SUI> required for initial follows
- Automatically tracked per user

### ⚡ Gas Optimization
- Uses owned objects (FollowBook/Market) instead of shared objects
- Avoids consensus bottlenecks
- Batch operations to amortize costs
- Storage rebates on unfollow

## Contract Architecture

### Core Objects

```move
// Personal follow book (owned by user)
struct FollowBook {
    id: UID,
    owner: address,
    following: Table<address, bool>,  // Who I follow
    following_count: u64,
    sponsor_left: u64,  // Remaining free follows (starts at 7)
}

// Creator's market (owned by creator)
struct Market {
    id: UID,
    owner: address,
    supply: u64,  // Number of followers (keys issued)
    treasury: Balance<SUI>,  // Accumulated funds from key sales
}

// Extended profile for MemeFlow
struct MemeFlowProfile {
    id: UID,
    owner: address,
    follow_book_id: address,
    market_id: address,
    token_address: Option<address>,
    token_symbol: vector<u8>,
    follower_count: u64,
    following_count: u64,
    username: vector<u8>,
    bio: vector<u8>,
    avatar_url: vector<u8>,
    total_volume_traded: u64,
    total_fees_earned: u64,
}
```

## API Functions

### Profile Creation

```move
// Create both FollowBook and Market
public entry fun create_profile(ctx: &mut TxContext)

// Create extended MemeFlow profile
public entry fun create_memeflow_profile(
    username: vector<u8>,
    bio: vector<u8>,
    avatar_url: vector<u8>,
    registry: &mut ProfileRegistry,
    ctx: &mut TxContext,
)
```

### Following Operations

```move
// Sponsored follow (first 7 are free)
public entry fun sponsored_buy_key(
    buyer_book: &mut FollowBook,
    seller_market: &mut Market,
    ctx: &mut TxContext,
)

// Paid follow with SUI
public entry fun buy_key(
    buyer_book: &mut FollowBook,
    seller_market: &mut Market,
    payment: Coin<SUI>,
    ctx: &mut TxContext,
)

// Batch follow multiple users
public entry fun batch_buy_keys(
    buyer_book: &mut FollowBook,
    seller_markets: vector<&mut Market>,
    payments: vector<Coin<SUI>>,
    ctx: &mut TxContext,
)

// Unfollow and get refund
public entry fun sell_key(
    seller_book: &mut FollowBook,
    target_market: &mut Market,
    ctx: &mut TxContext,
)
```

### Creator Functions

```move
// Withdraw earnings from treasury
public entry fun withdraw_treasury(
    market: &mut Market,
    amount_mist: u64,
    ctx: &mut TxContext,
)
```

### View Functions

```move
// Check if following someone
public fun is_following(book: &FollowBook, target: address): bool

// Get current market supply (follower count)
public fun get_market_supply(market: &Market): u64

// Calculate next buy price
public fun next_buy_price_mist(current_supply: u64): u64

// Calculate sell refund amount
public fun current_sell_refund_mist(current_supply: u64): u64
```

## Events

The system emits the following events for indexing:

```move
struct Followed {
    follower: address,
    followee: address,
}

struct Unfollowed {
    follower: address,
    followee: address,
}

struct BoughtKey {
    buyer: address,
    seller: address,
    price_mist: u64,
    sponsored: bool,
    new_supply: u64,
}

struct SoldKey {
    seller: address,
    target: address,
    refund_mist: u64,
    new_supply: u64,
}
```

## Pricing Examples

| Followers | Price (SUI) | Price (MIST) |
|-----------|-------------|--------------|
| 1st       | 0.0000625   | 62,500       |
| 2nd       | 0.00025     | 250,000      |
| 10th      | 0.00625     | 6,250,000    |
| 100th     | 0.625       | 625,000,000  |
| 1000th    | 62.5        | 62,500,000,000 |

## Usage Flow

### New User Onboarding
1. User calls `create_profile()` to initialize FollowBook and Market
2. User gets 7 free follows via `sponsored_buy_key()`
3. After 7 free follows, user must use `buy_key()` with SUI payment

### Following Someone
1. Calculate price: `next_buy_price_mist(target.supply)`
2. Prepare payment: `Coin<SUI>` with sufficient amount
3. Call `buy_key()` with payment
4. System handles change if overpaid

### Unfollowing Someone
1. Call `sell_key()` with target's Market
2. Receive refund based on current supply
3. Storage rebate bonus from table entry removal

### Creator Monetization
1. Accumulate funds in Market treasury as people follow
2. Call `withdraw_treasury()` to extract earnings
3. Track performance via events and supply metrics

## Security Considerations

1. **No self-following**: Enforced at contract level
2. **Idempotent operations**: Double-follow attempts are safely ignored
3. **Overflow protection**: Uses u128 for intermediate calculations
4. **Owner-only operations**: Treasury withdrawal restricted to market owner
5. **Change handling**: Automatic refund of overpayments

## Gas Optimization Tips

1. Use `batch_buy_keys()` for multiple follows in one transaction
2. Leverage sponsored follows for new user onboarding
3. Unfollow operations provide storage rebates
4. All operations use owned objects (no shared object contention)

## Integration with Frontend

The frontend should:
1. Check remaining sponsored follows before showing payment UI
2. Calculate required payment using `next_buy_price_mist()`
3. Show potential refund using `current_sell_refund_mist()`
4. Listen to events for real-time social graph updates
5. Cache follow relationships locally for performance

## Testing

Run tests with:
```bash
sui move test
```

Key test scenarios:
- Profile creation
- Sponsored follows (first 7)
- Paid follows with exact and overpayment
- Unfollow with refund
- Batch operations
- Treasury withdrawal
- Sponsor limit enforcement

## Deployment

1. Update Move.toml with your package address
2. Build: `sui move build`
3. Deploy: `sui client publish --gas-budget 100000000`
4. Note the package ID and object IDs for integration

## Notes for Implementation

The current implementation requires some adjustments for the latest Sui Move version:
- Event structs need proper module-level declaration
- Function names cannot start with underscore
- Use `transfer::public_transfer` instead of `coin::transfer`
- Table operations may need syntax updates

These are minor changes that maintain the core logic and economic model while ensuring compatibility with the current Sui blockchain.