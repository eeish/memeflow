/// MemeFlow Token Factory - Unified contract for creating and managing all meme tokens
/// Similar to Pumpfun's architecture for gas efficiency and centralized management
module memeflow::meme_token_factory {
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::balance::{Self, Balance};
    use sui::event;
    use sui::table::{Self, Table};
    use sui::clock::{Self, Clock};
    use sui::transfer;
    use sui::tx_context::{Self};
    use sui::object::{Self};
    use sui::sui::SUI;
    use std::string::{Self, String};
    use std::option::{Self};

    // ===== Error Codes =====
    const ENotOwner: u64 = 0;
    const ETokenExists: u64 = 1;
    const ETokenNotFound: u64 = 2;
    const EInsufficientPayment: u64 = 3;
    const EInvalidAmount: u64 = 4;
    const ETradingNotEnabled: u64 = 5;
    const ESlippageTooHigh: u64 = 6;
    // const EInsufficientLiquidity: u64 = 7; // Unused

    // ===== Constants =====
    const TOKEN_CREATION_FEE: u64 = 1_000_000_000; // 1 SUI in MIST
    const INITIAL_SUPPLY: u64 = 1_000_000_000_000_000_000; // 1 billion tokens (18 decimals)
    const BONDING_CURVE_TARGET: u64 = 69_000_000_000; // 69 SUI target for graduation
    const PLATFORM_FEE_BPS: u64 = 100; // 1% platform fee (100 basis points)

    // ===== Structs =====

    /// The main factory that manages all meme tokens
    public struct MemeTokenFactory has key {
        id: object::UID,
        owner: address,
        tokens: Table<String, TokenInfo>, // symbol -> TokenInfo
        total_tokens_created: u64,
        platform_fees_collected: Balance<SUI>,
        creation_fee: u64,
    }

    /// Information about each meme token
    public struct TokenInfo has store {
        symbol: String,
        name: String,
        description: String,
        image_url: String,
        creator: address,
        created_at: u64,
        treasury_cap_id: object::ID,
        total_supply: u64,
        circulating_supply: u64,
        bonding_curve_progress: u64, // Amount of SUI raised
        trading_enabled: bool,
        sui_reserve: u64, // SUI in bonding curve
        token_reserve: u64, // Tokens available for sale
    }

    /// Individual meme token (generic placeholder)
    /// Each token will have its own type when created
    public struct MEME_TOKEN has drop {}

    /// Liquidity pool for graduated tokens
    public struct LiquidityPool<phantom T> has key {
        id: object::UID,
        token_symbol: String,
        sui_reserve: Balance<SUI>,
        token_reserve: Balance<T>,
        lp_token_supply: u64,
        _trading_enabled: bool, // Prefixed with _ to indicate intentionally unused
    }

    /// LP Token for liquidity providers
    public struct LPToken<phantom T> has key, store {
        id: object::UID,
        pool_id: object::ID,
        amount: u64,
    }

    // ===== Events =====

    public struct TokenCreated has copy, drop {
        symbol: String,
        name: String,
        creator: address,
        treasury_cap_id: object::ID,
        timestamp: u64,
    }

    public struct TokenPurchased has copy, drop {
        symbol: String,
        buyer: address,
        sui_amount: u64,
        token_amount: u64,
        new_price: u64,
        timestamp: u64,
    }

    public struct TokenSold has copy, drop {
        symbol: String,
        seller: address,
        token_amount: u64,
        sui_amount: u64,
        new_price: u64,
        timestamp: u64,
    }

    public struct TokenGraduated has copy, drop {
        symbol: String,
        sui_raised: u64,
        liquidity_pool_id: object::ID,
        timestamp: u64,
    }

    // ===== Public Functions =====

    /// Initialize the MemeTokenFactory
    fun init(ctx: &mut TxContext) {
        let factory = MemeTokenFactory {
            id: object::new(ctx),
            owner: tx_context::sender(ctx),
            tokens: table::new(ctx),
            total_tokens_created: 0,
            platform_fees_collected: balance::zero(),
            creation_fee: TOKEN_CREATION_FEE,
        };
        
        transfer::share_object(factory);
    }

    /// Create a new meme token
    public entry fun create_meme_token(
        factory: &mut MemeTokenFactory,
        mut payment: Coin<SUI>,
        symbol: vector<u8>,
        name: vector<u8>,
        description: vector<u8>,
        image_url: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let symbol_str = string::utf8(symbol);
        let sender = tx_context::sender(ctx);
        
        // Check if token already exists
        assert!(!table::contains(&factory.tokens, symbol_str), ETokenExists);
        
        // Check payment
        let payment_amount = coin::value(&payment);
        assert!(payment_amount >= factory.creation_fee, EInsufficientPayment);
        
        // Take creation fee
        let fee_coin = coin::split(&mut payment, factory.creation_fee, ctx);
        balance::join(&mut factory.platform_fees_collected, coin::into_balance(fee_coin));
        
        // Return excess payment
        if (coin::value(&payment) > 0) {
            transfer::public_transfer(payment, sender);
        } else {
            coin::destroy_zero(payment);
        };

        // Create the treasury cap (this would be dynamic in real implementation)
        let treasury_cap = create_currency_treasury(symbol, ctx);
        let treasury_cap_id = object::id(&treasury_cap);

        // Create token info
        let token_info = TokenInfo {
            symbol: symbol_str,
            name: string::utf8(name),
            description: string::utf8(description),
            image_url: string::utf8(image_url),
            creator: sender,
            created_at: clock::timestamp_ms(clock),
            treasury_cap_id,
            total_supply: INITIAL_SUPPLY,
            circulating_supply: 0,
            bonding_curve_progress: 0,
            trading_enabled: true,
            sui_reserve: 0,
            token_reserve: INITIAL_SUPPLY, // All tokens start in bonding curve
        };

        // Store token info
        table::add(&mut factory.tokens, symbol_str, token_info);
        factory.total_tokens_created = factory.total_tokens_created + 1;

        // Transfer treasury cap to factory (in practice, we'd store this securely)
        transfer::public_transfer(treasury_cap, factory.owner);

        // Emit event
        event::emit(TokenCreated {
            symbol: symbol_str,
            name: string::utf8(name),
            creator: sender,
            treasury_cap_id,
            timestamp: clock::timestamp_ms(clock),
        });
    }

    /// Buy tokens from bonding curve
    public entry fun buy_tokens(
        factory: &mut MemeTokenFactory,
        symbol: vector<u8>,
        mut payment: Coin<SUI>,
        min_tokens_out: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let symbol_str = string::utf8(symbol);
        let sender = tx_context::sender(ctx);
        
        // Check if token exists
        assert!(table::contains(&factory.tokens, symbol_str), ETokenNotFound);
        
        let token_info = table::borrow_mut(&mut factory.tokens, symbol_str);
        assert!(token_info.trading_enabled, ETradingNotEnabled);

        let sui_amount = coin::value(&payment);
        assert!(sui_amount > 0, EInvalidAmount);

        // Calculate tokens to mint using bonding curve formula
        let tokens_out = calculate_buy_amount(
            token_info.sui_reserve,
            token_info.token_reserve,
            sui_amount
        );

        // Check slippage
        assert!(tokens_out >= min_tokens_out, ESlippageTooHigh);

        // Take platform fee
        let platform_fee = (sui_amount * PLATFORM_FEE_BPS) / 10000;
        let fee_coin = coin::split(&mut payment, platform_fee, ctx);
        balance::join(&mut factory.platform_fees_collected, coin::into_balance(fee_coin));

        // Update reserves
        let net_sui = sui_amount - platform_fee;
        token_info.sui_reserve = token_info.sui_reserve + net_sui;
        token_info.token_reserve = token_info.token_reserve - tokens_out;
        token_info.circulating_supply = token_info.circulating_supply + tokens_out;
        token_info.bonding_curve_progress = token_info.bonding_curve_progress + net_sui;

        // Store SUI payment in bonding curve (not platform fees)
        // We need to maintain this separately from platform fees

        // TODO: Implement actual token minting with dynamic token types
        // This requires integration with dynamic_token module

        // Calculate new price
        let new_price = calculate_current_price(token_info.sui_reserve, token_info.token_reserve);

        // Check if graduation threshold is reached
        if (token_info.bonding_curve_progress >= BONDING_CURVE_TARGET) {
            graduate_token(factory, symbol_str, ctx);
        };

        // Return excess payment if any
        if (coin::value(&payment) > 0) {
            transfer::public_transfer(payment, sender);
        } else {
            coin::destroy_zero(payment);
        };

        // Emit event
        event::emit(TokenPurchased {
            symbol: symbol_str,
            buyer: sender,
            sui_amount,
            token_amount: tokens_out,
            new_price,
            timestamp: clock::timestamp_ms(clock),
        });
    }

    /// Sell tokens back to bonding curve
    public entry fun sell_tokens(
        factory: &mut MemeTokenFactory,
        symbol: vector<u8>,
        // token_coin: Coin<T>, // Would be the actual token type
        token_amount: u64,
        min_sui_out: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let symbol_str = string::utf8(symbol);
        let sender = tx_context::sender(ctx);
        
        // Check if token exists
        assert!(table::contains(&factory.tokens, symbol_str), ETokenNotFound);
        
        let token_info = table::borrow_mut(&mut factory.tokens, symbol_str);
        assert!(token_info.trading_enabled, ETradingNotEnabled);

        // Calculate SUI to return
        let sui_out = calculate_sell_amount(
            token_info.sui_reserve,
            token_info.token_reserve,
            token_amount
        );

        // Check slippage
        assert!(sui_out >= min_sui_out, ESlippageTooHigh);

        // Take platform fee
        let platform_fee = (sui_out * PLATFORM_FEE_BPS) / 10000;
        let net_sui = sui_out - platform_fee;

        // Update reserves
        token_info.sui_reserve = token_info.sui_reserve - sui_out;
        token_info.token_reserve = token_info.token_reserve + token_amount;
        token_info.circulating_supply = token_info.circulating_supply - token_amount;

        // Burn tokens (simplified)
        // coin::burn(treasury_cap, token_coin);

        // TODO: Implement actual SUI transfer from bonding curve reserves
        // This requires proper reserve management

        // Calculate new price
        let new_price = calculate_current_price(token_info.sui_reserve, token_info.token_reserve);

        // Emit event
        event::emit(TokenSold {
            symbol: symbol_str,
            seller: sender,
            token_amount,
            sui_amount: net_sui,
            new_price,
            timestamp: clock::timestamp_ms(clock),
        });
    }

    // ===== Private Functions =====

    /// Create a currency treasury (placeholder - needs dynamic implementation)
    /// In production, this should integrate with dynamic_token module
    fun create_currency_treasury(
        symbol: vector<u8>,
        ctx: &mut TxContext
    ): TreasuryCap<MEME_TOKEN> {
        // WARNING: This is a simplified implementation
        // Real implementation should use dynamic token creation
        let (treasury_cap, metadata) = coin::create_currency(
            MEME_TOKEN {},
            9, // decimals
            symbol,
            symbol, // Use symbol as name for now
            b"MemeFlow Token",
            option::none(),
            ctx
        );
        // Store metadata properly
        transfer::public_share_object(metadata);
        treasury_cap
    }

    /// Graduate token to AMM pool
    fun graduate_token(
        factory: &mut MemeTokenFactory,
        symbol: String,
        ctx: &mut TxContext
    ) {
        let token_info = table::borrow_mut(&mut factory.tokens, symbol);
        
        // Disable bonding curve trading
        token_info.trading_enabled = false;

        // Create liquidity pool with the raised SUI and remaining tokens
        let pool_id = create_liquidity_pool(
            symbol,
            token_info.sui_reserve,
            token_info.token_reserve,
            ctx
        );

        // Emit graduation event
        event::emit(TokenGraduated {
            symbol,
            sui_raised: token_info.bonding_curve_progress,
            liquidity_pool_id: pool_id,
            timestamp: 0, // Would use clock
        });
    }

    /// Create liquidity pool for graduated token
    fun create_liquidity_pool(
        _symbol: String,
        _sui_amount: u64,
        _token_amount: u64,
        ctx: &mut TxContext
    ): ID {
        // Simplified - would create actual AMM pool
        let dummy_id = object::new(ctx);
        let id = object::uid_to_inner(&dummy_id);
        object::delete(dummy_id);
        id
    }

    // ===== Bonding Curve Math =====

    /// Calculate token amount for SUI input (buy)
    /// Uses a linear bonding curve for simplicity
    fun calculate_buy_amount(
        sui_reserve: u64,
        token_reserve: u64,
        sui_in: u64
    ): u64 {
        if (token_reserve == 0) return 0;
        
        // Simplified linear bonding curve
        // In practice, you'd use a more sophisticated curve like x*y=k
        let mut price_per_token = (sui_reserve * 1000000) / (INITIAL_SUPPLY - token_reserve + 1);
        if (price_per_token == 0) price_per_token = 1;
        
        (sui_in * 1000000) / price_per_token
    }

    /// Calculate SUI amount for token input (sell)
    fun calculate_sell_amount(
        sui_reserve: u64,
        token_reserve: u64,
        token_in: u64
    ): u64 {
        if (sui_reserve == 0) return 0;
        
        // Simplified linear bonding curve
        let price_per_token = (sui_reserve * 1000000) / (INITIAL_SUPPLY - token_reserve + 1);
        (token_in * price_per_token) / 1000000
    }

    /// Calculate current token price
    fun calculate_current_price(
        sui_reserve: u64,
        token_reserve: u64
    ): u64 {
        if (token_reserve == 0) return 0;
        (sui_reserve * 1000000) / (INITIAL_SUPPLY - token_reserve + 1)
    }

    // ===== View Functions =====

    /// Get token information
    public fun get_token_info(
        factory: &MemeTokenFactory,
        symbol: String
    ): (String, String, String, String, address, u64, u64, u64, bool) {
        assert!(table::contains(&factory.tokens, symbol), ETokenNotFound);
        let token_info = table::borrow(&factory.tokens, symbol);
        
        (
            token_info.symbol,
            token_info.name,
            token_info.description,
            token_info.image_url,
            token_info.creator,
            token_info.total_supply,
            token_info.circulating_supply,
            token_info.bonding_curve_progress,
            token_info.trading_enabled
        )
    }

    /// Get current token price
    public fun get_token_price(
        factory: &MemeTokenFactory,
        symbol: String
    ): u64 {
        assert!(table::contains(&factory.tokens, symbol), ETokenNotFound);
        let token_info = table::borrow(&factory.tokens, symbol);
        calculate_current_price(token_info.sui_reserve, token_info.token_reserve)
    }

    /// Get factory statistics
    public fun get_factory_stats(factory: &MemeTokenFactory): (u64, u64) {
        (
            factory.total_tokens_created,
            balance::value(&factory.platform_fees_collected)
        )
    }

    /// Check if a token symbol exists
    public fun token_exists(factory: &MemeTokenFactory, symbol: String): bool {
        table::contains(&factory.tokens, symbol)
    }

    // ===== Admin Functions =====

    /// Update creation fee (owner only)
    public entry fun update_creation_fee(
        factory: &mut MemeTokenFactory,
        new_fee: u64,
        ctx: &TxContext
    ) {
        assert!(tx_context::sender(ctx) == factory.owner, ENotOwner);
        factory.creation_fee = new_fee;
    }

    /// Withdraw platform fees (owner only)
    public entry fun withdraw_fees(
        factory: &mut MemeTokenFactory,
        amount: u64,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(sender == factory.owner, ENotOwner);
        
        let fee_balance = balance::split(&mut factory.platform_fees_collected, amount);
        let fee_coin = coin::from_balance(fee_balance, ctx);
        transfer::public_transfer(fee_coin, sender);
    }
}