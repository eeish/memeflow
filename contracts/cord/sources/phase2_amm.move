/// Phase 2 AMM Module
/// - One protocol-owned TOKEN/SUI pool per graduated creator token.
/// - Constant-product pricing with exact-input swaps.
/// - Fees remain in the pool; there are no user LP positions in v1.
module cord::phase2_amm {
    use sui::balance::{Self as balance, Balance};
    use sui::coin::{Self as coin, Coin};
    use sui::event;
    use sui::sui::SUI;
    use sui::tx_context::{Self as tx};

    const BPS_DENOMINATOR: u64 = 10_000;
    const TOKEN_DECIMALS_SCALAR: u64 = 1_000_000_000;

    const E_ZERO_LIQUIDITY: u64 = 1;
    const E_ZERO_INPUT: u64 = 2;
    const E_INVALID_FEE_BPS: u64 = 3;
    const E_INSUFFICIENT_LIQUIDITY: u64 = 4;
    const E_SLIPPAGE_EXCEEDED: u64 = 5;

    public struct CreatorTokenAmmPool<phantom T> has key, store {
        id: object::UID,
        market_id: address,
        creator: address,
        vault_id: address,
        fee_bps: u64,
        sui_liquidity: Balance<SUI>,
        token_liquidity: Balance<T>,
        sui_reserve_mist: u64,
        token_reserve: u64,
        total_swaps: u64,
        cumulative_volume_sui_mist: u64,
    }

    public struct AmmPoolInitialized has copy, drop {
        pool_id: address,
        market_id: address,
        creator: address,
        vault_id: address,
        fee_bps: u64,
        initial_sui_mist: u64,
        initial_token_liquidity: u64,
    }

    public struct AmmSwapExecuted has copy, drop {
        pool_id: address,
        market_id: address,
        trader: address,
        is_buy: bool,
        amount_in: u64,
        amount_out: u64,
        fee_bps: u64,
        new_sui_reserve_mist: u64,
        new_token_reserve: u64,
        total_swaps: u64,
    }

    public(package) fun create_pool<T>(
        market_id: address,
        creator: address,
        vault_id: address,
        sui_liquidity: Balance<SUI>,
        token_liquidity: Balance<T>,
        fee_bps: u64,
        ctx: &mut TxContext,
    ): address {
        assert!(fee_bps < BPS_DENOMINATOR, E_INVALID_FEE_BPS);

        let initial_sui_mist = balance::value(&sui_liquidity);
        let initial_token_liquidity = balance::value(&token_liquidity);
        assert!(initial_sui_mist > 0, E_ZERO_LIQUIDITY);
        assert!(initial_token_liquidity > 0, E_ZERO_LIQUIDITY);

        let pool = CreatorTokenAmmPool<T> {
            id: object::new(ctx),
            market_id,
            creator,
            vault_id,
            fee_bps,
            sui_liquidity,
            token_liquidity,
            sui_reserve_mist: initial_sui_mist,
            token_reserve: initial_token_liquidity,
            total_swaps: 0,
            cumulative_volume_sui_mist: 0,
        };
        let pool_id = object::uid_to_address(&pool.id);
        transfer::share_object(pool);

        event::emit(AmmPoolInitialized {
            pool_id,
            market_id,
            creator,
            vault_id,
            fee_bps,
            initial_sui_mist,
            initial_token_liquidity,
        });

        pool_id
    }

    public fun quote_amount_out(
        amount_in: u64,
        reserve_in: u64,
        reserve_out: u64,
        fee_bps: u64,
    ): u64 {
        assert!(fee_bps < BPS_DENOMINATOR, E_INVALID_FEE_BPS);
        if (amount_in == 0 || reserve_in == 0 || reserve_out == 0) {
            return 0
        };

        let amount_in_with_fee = (amount_in as u128) * ((BPS_DENOMINATOR - fee_bps) as u128);
        let numerator = amount_in_with_fee * (reserve_out as u128);
        let denominator = (reserve_in as u128) * (BPS_DENOMINATOR as u128) + amount_in_with_fee;
        (numerator / denominator) as u64
    }

    public fun quote_buy_tokens_out<T>(pool: &CreatorTokenAmmPool<T>, sui_in_mist: u64): u64 {
        quote_amount_out(sui_in_mist, pool.sui_reserve_mist, pool.token_reserve, pool.fee_bps)
    }

    public fun quote_sell_sui_out<T>(pool: &CreatorTokenAmmPool<T>, token_in: u64): u64 {
        quote_amount_out(token_in, pool.token_reserve, pool.sui_reserve_mist, pool.fee_bps)
    }

    public fun get_spot_price_mist<T>(pool: &CreatorTokenAmmPool<T>): u64 {
        if (pool.token_reserve == 0) {
            0
        } else {
            (((pool.sui_reserve_mist as u128) * (TOKEN_DECIMALS_SCALAR as u128)) / (pool.token_reserve as u128)) as u64
        }
    }

    public fun get_market_id<T>(pool: &CreatorTokenAmmPool<T>): address { pool.market_id }
    public fun get_creator<T>(pool: &CreatorTokenAmmPool<T>): address { pool.creator }
    public fun get_vault_id<T>(pool: &CreatorTokenAmmPool<T>): address { pool.vault_id }
    public fun get_fee_bps<T>(pool: &CreatorTokenAmmPool<T>): u64 { pool.fee_bps }
    public fun get_sui_reserve_mist<T>(pool: &CreatorTokenAmmPool<T>): u64 { pool.sui_reserve_mist }
    public fun get_token_reserve<T>(pool: &CreatorTokenAmmPool<T>): u64 { pool.token_reserve }
    public fun get_total_swaps<T>(pool: &CreatorTokenAmmPool<T>): u64 { pool.total_swaps }
    public fun get_cumulative_volume_sui_mist<T>(pool: &CreatorTokenAmmPool<T>): u64 { pool.cumulative_volume_sui_mist }

    #[allow(lint(self_transfer))]
    public fun buy_exact_sui_for_tokens<T>(
        pool: &mut CreatorTokenAmmPool<T>,
        payment: Coin<SUI>,
        min_token_out: u64,
        ctx: &mut TxContext,
    ) {
        let trader = tx::sender(ctx);
        let amount_in = coin::value(&payment);
        assert!(amount_in > 0, E_ZERO_INPUT);

        let amount_out = quote_buy_tokens_out(pool, amount_in);
        assert!(amount_out > 0, E_INSUFFICIENT_LIQUIDITY);
        assert!(amount_out >= min_token_out, E_SLIPPAGE_EXCEEDED);
        assert!(pool.token_reserve >= amount_out, E_INSUFFICIENT_LIQUIDITY);

        let payment_balance = coin::into_balance(payment);
        balance::join(&mut pool.sui_liquidity, payment_balance);

        let out_balance = balance::split(&mut pool.token_liquidity, amount_out);
        let out_coin = coin::from_balance(out_balance, ctx);
        transfer::public_transfer(out_coin, trader);

        pool.sui_reserve_mist = pool.sui_reserve_mist + amount_in;
        pool.token_reserve = pool.token_reserve - amount_out;
        pool.total_swaps = pool.total_swaps + 1;
        pool.cumulative_volume_sui_mist = pool.cumulative_volume_sui_mist + amount_in;

        event::emit(AmmSwapExecuted {
            pool_id: object::uid_to_address(&pool.id),
            market_id: pool.market_id,
            trader,
            is_buy: true,
            amount_in,
            amount_out,
            fee_bps: pool.fee_bps,
            new_sui_reserve_mist: pool.sui_reserve_mist,
            new_token_reserve: pool.token_reserve,
            total_swaps: pool.total_swaps,
        });
    }

    #[allow(lint(self_transfer))]
    public fun sell_exact_tokens_for_sui<T>(
        pool: &mut CreatorTokenAmmPool<T>,
        payment: Coin<T>,
        min_sui_out: u64,
        ctx: &mut TxContext,
    ) {
        let trader = tx::sender(ctx);
        let amount_in = coin::value(&payment);
        assert!(amount_in > 0, E_ZERO_INPUT);

        let amount_out = quote_sell_sui_out(pool, amount_in);
        assert!(amount_out > 0, E_INSUFFICIENT_LIQUIDITY);
        assert!(amount_out >= min_sui_out, E_SLIPPAGE_EXCEEDED);
        assert!(pool.sui_reserve_mist >= amount_out, E_INSUFFICIENT_LIQUIDITY);

        let payment_balance = coin::into_balance(payment);
        balance::join(&mut pool.token_liquidity, payment_balance);

        let out_balance = balance::split(&mut pool.sui_liquidity, amount_out);
        let out_coin = coin::from_balance(out_balance, ctx);
        transfer::public_transfer(out_coin, trader);

        pool.token_reserve = pool.token_reserve + amount_in;
        pool.sui_reserve_mist = pool.sui_reserve_mist - amount_out;
        pool.total_swaps = pool.total_swaps + 1;
        pool.cumulative_volume_sui_mist = pool.cumulative_volume_sui_mist + amount_out;

        event::emit(AmmSwapExecuted {
            pool_id: object::uid_to_address(&pool.id),
            market_id: pool.market_id,
            trader,
            is_buy: false,
            amount_in,
            amount_out,
            fee_bps: pool.fee_bps,
            new_sui_reserve_mist: pool.sui_reserve_mist,
            new_token_reserve: pool.token_reserve,
            total_swaps: pool.total_swaps,
        });
    }
}
