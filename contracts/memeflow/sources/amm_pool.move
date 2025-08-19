/// Automated Market Maker (AMM) pool for graduated meme tokens
/// Implements constant product formula (x * y = k) for trading
module memeflow::amm_pool {
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::tx_context;
    use sui::object;
    use sui::sui::SUI;
    use sui::event;
    use sui::clock::{Self, Clock};
    use std::string::String;

    // ===== Error Codes =====
    const EInsufficientLiquidity: u64 = 0;
    const EInvalidAmount: u64 = 1;
    const ESlippageTooHigh: u64 = 2;
    const EPoolNotActive: u64 = 3;
    // const EInsufficientLPTokens: u64 = 4; // Unused
    const ENotAuthorized: u64 = 5;

    // ===== Constants =====
    const MINIMUM_LIQUIDITY: u64 = 1000; // Minimum LP tokens to prevent division by zero
    const FEE_BPS: u64 = 30; // 0.3% trading fee (30 basis points)

    // ===== Structs =====

    /// AMM liquidity pool for token/SUI pair
    public struct Pool<phantom T> has key {
        id: object::UID,
        token_symbol: String,
        sui_reserve: Balance<SUI>,
        token_reserve: Balance<T>,
        lp_token_supply: u64,
        is_active: bool,
        created_at: u64,
        creator: address,
        total_volume_sui: u64,
        total_fees_collected: u64,
    }

    /// Liquidity Provider (LP) token representing ownership in the pool
    public struct LPToken<phantom T> has key, store {
        id: object::UID,
        pool_id: object::ID,
        amount: u64,
    }

    /// Pool creation capability (only factory can create pools)
    public struct PoolCreationCap has key, store {
        id: object::UID,
    }

    // ===== Events =====

    public struct PoolCreated<phantom T> has copy, drop {
        pool_id: object::ID,
        token_symbol: String,
        initial_sui: u64,
        initial_tokens: u64,
        creator: address,
        timestamp: u64,
    }

    public struct Swap<phantom T> has copy, drop {
        pool_id: object::ID,
        user: address,
        sui_in: u64,
        token_in: u64,
        sui_out: u64,
        token_out: u64,
        fee_amount: u64,
        timestamp: u64,
    }

    public struct LiquidityAdded<phantom T> has copy, drop {
        pool_id: object::ID,
        provider: address,
        sui_amount: u64,
        token_amount: u64,
        lp_tokens_minted: u64,
        timestamp: u64,
    }

    public struct LiquidityRemoved<phantom T> has copy, drop {
        pool_id: object::ID,
        provider: address,
        sui_amount: u64,
        token_amount: u64,
        lp_tokens_burned: u64,
        timestamp: u64,
    }

    // ===== Pool Creation =====

    /// Create a new AMM pool (only callable by factory with PoolCreationCap)
    public fun create_pool<T>(
        _cap: &PoolCreationCap,
        token_symbol: String,
        initial_sui: Coin<SUI>,
        initial_tokens: Coin<T>,
        clock: &Clock,
        ctx: &mut TxContext
    ): ID {
        let sender = tx_context::sender(ctx);
        
        let sui_amount = coin::value(&initial_sui);
        let token_amount = coin::value(&initial_tokens);
        
        assert!(sui_amount > 0 && token_amount > 0, EInvalidAmount);

        // Calculate initial LP tokens (geometric mean)
        let lp_tokens = sqrt(sui_amount * token_amount);
        assert!(lp_tokens > MINIMUM_LIQUIDITY, EInsufficientLiquidity);

        // Create the pool
        let pool = Pool<T> {
            id: object::new(ctx),
            token_symbol,
            sui_reserve: coin::into_balance(initial_sui),
            token_reserve: coin::into_balance(initial_tokens),
            lp_token_supply: lp_tokens,
            is_active: true,
            created_at: clock::timestamp_ms(clock),
            creator: sender,
            total_volume_sui: 0,
            total_fees_collected: 0,
        };

        let pool_id = object::id(&pool);

        // Mint initial LP tokens to creator
        let lp_token = LPToken<T> {
            id: object::new(ctx),
            pool_id,
            amount: lp_tokens,
        };

        transfer::transfer(lp_token, sender);

        // Emit event
        event::emit(PoolCreated<T> {
            pool_id,
            token_symbol,
            initial_sui: sui_amount,
            initial_tokens: token_amount,
            creator: sender,
            timestamp: clock::timestamp_ms(clock),
        });

        // Share the pool
        transfer::share_object(pool);
        pool_id
    }

    // ===== Trading Functions =====

    /// Swap SUI for tokens
    public entry fun swap_sui_for_tokens<T>(
        pool: &mut Pool<T>,
        sui_in: Coin<SUI>,
        min_tokens_out: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(pool.is_active, EPoolNotActive);
        
        let sender = tx_context::sender(ctx);
        let sui_amount = coin::value(&sui_in);
        assert!(sui_amount > 0, EInvalidAmount);

        let sui_reserve = balance::value(&pool.sui_reserve);
        let token_reserve = balance::value(&pool.token_reserve);

        // Calculate output with fee
        let tokens_out = get_amount_out(sui_amount, sui_reserve, token_reserve);
        assert!(tokens_out >= min_tokens_out, ESlippageTooHigh);

        // Calculate and take fee
        let fee = (sui_amount * FEE_BPS) / 10000;
        let _sui_after_fee = sui_amount - fee;

        // Update reserves
        balance::join(&mut pool.sui_reserve, coin::into_balance(sui_in));
        let tokens_out_balance = balance::split(&mut pool.token_reserve, tokens_out);
        let tokens_out_coin = coin::from_balance(tokens_out_balance, ctx);

        // Update statistics
        pool.total_volume_sui = pool.total_volume_sui + sui_amount;
        pool.total_fees_collected = pool.total_fees_collected + fee;

        // Transfer tokens to user
        transfer::public_transfer(tokens_out_coin, sender);

        // Emit event
        event::emit(Swap<T> {
            pool_id: object::id(pool),
            user: sender,
            sui_in: sui_amount,
            token_in: 0,
            sui_out: 0,
            token_out: tokens_out,
            fee_amount: fee,
            timestamp: clock::timestamp_ms(clock),
        });
    }

    /// Swap tokens for SUI
    public entry fun swap_tokens_for_sui<T>(
        pool: &mut Pool<T>,
        tokens_in: Coin<T>,
        min_sui_out: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(pool.is_active, EPoolNotActive);
        
        let sender = tx_context::sender(ctx);
        let token_amount = coin::value(&tokens_in);
        assert!(token_amount > 0, EInvalidAmount);

        let sui_reserve = balance::value(&pool.sui_reserve);
        let token_reserve = balance::value(&pool.token_reserve);

        // Calculate output with fee
        let sui_out = get_amount_out(token_amount, token_reserve, sui_reserve);
        assert!(sui_out >= min_sui_out, ESlippageTooHigh);

        // Calculate and subtract fee
        let fee = (sui_out * FEE_BPS) / 10000;
        let sui_after_fee = sui_out - fee;

        // Update reserves
        balance::join(&mut pool.token_reserve, coin::into_balance(tokens_in));
        let sui_out_balance = balance::split(&mut pool.sui_reserve, sui_out);
        let sui_out_coin = coin::from_balance(sui_out_balance, ctx);

        // Update statistics
        pool.total_volume_sui = pool.total_volume_sui + sui_out;
        pool.total_fees_collected = pool.total_fees_collected + fee;

        // Transfer SUI to user
        transfer::public_transfer(sui_out_coin, sender);

        // Emit event
        event::emit(Swap<T> {
            pool_id: object::id(pool),
            user: sender,
            sui_in: 0,
            token_in: token_amount,
            sui_out: sui_after_fee,
            token_out: 0,
            fee_amount: fee,
            timestamp: clock::timestamp_ms(clock),
        });
    }

    // ===== Liquidity Functions =====

    /// Add liquidity to the pool
    public entry fun add_liquidity<T>(
        pool: &mut Pool<T>,
        sui_in: Coin<SUI>,
        tokens_in: Coin<T>,
        min_lp_tokens: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(pool.is_active, EPoolNotActive);
        
        let sender = tx_context::sender(ctx);
        let sui_amount = coin::value(&sui_in);
        let token_amount = coin::value(&tokens_in);
        
        assert!(sui_amount > 0 && token_amount > 0, EInvalidAmount);

        let sui_reserve = balance::value(&pool.sui_reserve);
        let token_reserve = balance::value(&pool.token_reserve);

        // Calculate LP tokens to mint
        let lp_tokens_to_mint = if (pool.lp_token_supply == 0) {
            sqrt(sui_amount * token_amount)
        } else {
            let lp_from_sui = (sui_amount * pool.lp_token_supply) / sui_reserve;
            let lp_from_tokens = (token_amount * pool.lp_token_supply) / token_reserve;
            if (lp_from_sui < lp_from_tokens) lp_from_sui else lp_from_tokens
        };

        assert!(lp_tokens_to_mint >= min_lp_tokens, ESlippageTooHigh);

        // Update pool
        balance::join(&mut pool.sui_reserve, coin::into_balance(sui_in));
        balance::join(&mut pool.token_reserve, coin::into_balance(tokens_in));
        pool.lp_token_supply = pool.lp_token_supply + lp_tokens_to_mint;

        // Mint LP tokens
        let lp_token = LPToken<T> {
            id: object::new(ctx),
            pool_id: object::id(pool),
            amount: lp_tokens_to_mint,
        };

        transfer::transfer(lp_token, sender);

        // Emit event
        event::emit(LiquidityAdded<T> {
            pool_id: object::id(pool),
            provider: sender,
            sui_amount,
            token_amount,
            lp_tokens_minted: lp_tokens_to_mint,
            timestamp: clock::timestamp_ms(clock),
        });
    }

    /// Remove liquidity from the pool
    public entry fun remove_liquidity<T>(
        pool: &mut Pool<T>,
        lp_token: LPToken<T>,
        min_sui_out: u64,
        min_tokens_out: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(pool.is_active, EPoolNotActive);
        
        let sender = tx_context::sender(ctx);
        assert!(lp_token.pool_id == object::id(pool), EInvalidAmount);

        let lp_amount = lp_token.amount;
        assert!(lp_amount > 0, EInvalidAmount);

        let sui_reserve = balance::value(&pool.sui_reserve);
        let token_reserve = balance::value(&pool.token_reserve);

        // Calculate amounts to return
        let sui_out = (lp_amount * sui_reserve) / pool.lp_token_supply;
        let tokens_out = (lp_amount * token_reserve) / pool.lp_token_supply;

        assert!(sui_out >= min_sui_out, ESlippageTooHigh);
        assert!(tokens_out >= min_tokens_out, ESlippageTooHigh);

        // Update pool
        let sui_balance = balance::split(&mut pool.sui_reserve, sui_out);
        let token_balance = balance::split(&mut pool.token_reserve, tokens_out);
        pool.lp_token_supply = pool.lp_token_supply - lp_amount;

        // Convert to coins and transfer
        let sui_coin = coin::from_balance(sui_balance, ctx);
        let token_coin = coin::from_balance(token_balance, ctx);
        
        transfer::public_transfer(sui_coin, sender);
        transfer::public_transfer(token_coin, sender);

        // Burn LP token
        let LPToken { id, pool_id: _, amount: _ } = lp_token;
        object::delete(id);

        // Emit event
        event::emit(LiquidityRemoved<T> {
            pool_id: object::id(pool),
            provider: sender,
            sui_amount: sui_out,
            token_amount: tokens_out,
            lp_tokens_burned: lp_amount,
            timestamp: clock::timestamp_ms(clock),
        });
    }

    // ===== Math Functions =====

    /// Calculate output amount for constant product AMM
    /// Using formula: amountOut = (amountIn * reserveOut) / (reserveIn + amountIn)
    public fun get_amount_out(
        amount_in: u64,
        reserve_in: u64,
        reserve_out: u64
    ): u64 {
        assert!(amount_in > 0, EInvalidAmount);
        assert!(reserve_in > 0 && reserve_out > 0, EInsufficientLiquidity);

        let amount_in_with_fee = amount_in * (10000 - FEE_BPS);
        let numerator = amount_in_with_fee * reserve_out;
        let denominator = (reserve_in * 10000) + amount_in_with_fee;
        
        numerator / denominator
    }

    /// Simple square root implementation for LP token calculation
    fun sqrt(y: u64): u64 {
        if (y == 0) return 0;
        
        let mut z = y;
        let mut x = y / 2 + 1;
        
        while (x < z) {
            z = x;
            x = (y / x + x) / 2;
        };
        
        z
    }

    // ===== View Functions =====

    /// Get pool reserves
    public fun get_reserves<T>(pool: &Pool<T>): (u64, u64) {
        (
            balance::value(&pool.sui_reserve),
            balance::value(&pool.token_reserve)
        )
    }

    /// Get pool statistics
    public fun get_pool_stats<T>(pool: &Pool<T>): (u64, u64, u64, bool) {
        (
            pool.lp_token_supply,
            pool.total_volume_sui,
            pool.total_fees_collected,
            pool.is_active
        )
    }

    /// Get current token price in SUI
    public fun get_token_price<T>(pool: &Pool<T>): u64 {
        let sui_reserve = balance::value(&pool.sui_reserve);
        let token_reserve = balance::value(&pool.token_reserve);
        
        if (token_reserve == 0) return 0;
        
        (sui_reserve * 1_000_000_000) / token_reserve // Price in nanoSUI per token
    }

    // ===== Admin Functions =====

    /// Create pool creation capability (only factory should have this)
    public fun create_pool_creation_cap(ctx: &mut TxContext): PoolCreationCap {
        PoolCreationCap {
            id: object::new(ctx)
        }
    }

    /// Deactivate a pool (emergency function)
    public entry fun deactivate_pool<T>(
        pool: &mut Pool<T>,
        ctx: &TxContext
    ) {
        assert!(tx_context::sender(ctx) == pool.creator, ENotAuthorized);
        pool.is_active = false;
    }

    /// Reactivate a pool
    public entry fun reactivate_pool<T>(
        pool: &mut Pool<T>,
        ctx: &TxContext
    ) {
        assert!(tx_context::sender(ctx) == pool.creator, ENotAuthorized);
        pool.is_active = true;
    }
}