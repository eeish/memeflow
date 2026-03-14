/// Token Graduation Module (Phase 2)
/// - Graduation marks a market as finalized and blocks further share trading.
/// - The accumulated SUI treasury remains in the market (not drained to creator).
/// - Each creator publishes their own Coin<T> package off-chain.
/// - TreasuryCap<T> is then registered into this shared registry, which immediately
///   distributes TOKENS_PER_HOLDER creator tokens to every Phase 1 share holder.
module cord::graduation {
    use sui::coin::{Self as coin, TreasuryCap};
    use sui::dynamic_field;
    use sui::event;
    use sui::table::{Self as table, Table};
    use sui::tx_context::{Self as tx};

    use cord::runtime_config;
    use cord::share_market::{Self, Market};

    /// =============================
    /// Error Codes
    /// =============================

    const E_NOT_MARKET_OWNER: u64 = 100;
    const E_MARKET_NOT_READY: u64 = 101;
    const E_ALREADY_GRADUATED: u64 = 102;
    const E_MARKET_NOT_GRADUATED: u64 = 103;
    const E_TOKEN_ALREADY_REGISTERED: u64 = 104;
    const E_NOT_ADMIN: u64 = 105;
    const E_INVALID_POOL_ID: u64 = 106;
    const E_VAULT_MISMATCH: u64 = 107;

    /// Tokens minted to each Phase 1 share holder at token registration.
    /// With 9 decimal places this equals 1,000 tokens per holder.
    const TOKENS_PER_HOLDER: u64 = 1_000_000_000_000;
    const POOL_ID_FIELD_NAME: u8 = 0;

    /// =============================
    /// Events
    /// =============================

    public struct MarketGraduated has copy, drop {
        market_id: address,
        creator: address,
        holders: u64,
        total_graduated: u64,
    }

    public struct TokensDistributed has copy, drop {
        market_id: address,
        creator: address,
        holder_count: u64,
        tokens_per_holder: u64,
    }

    public struct CreatorTokenRegistered has copy, drop {
        market_id: address,
        creator: address,
        vault_id: address,
        symbol: vector<u8>,
        name: vector<u8>,
        total_registered: u64,
    }

    public struct MarketGraduationRolledBack has copy, drop {
        market_id: address,
        creator: address,
        total_graduated: u64,
    }

    public struct CreatorTokenPoolRegistered has copy, drop {
        market_id: address,
        creator: address,
        vault_id: address,
        pool_id: address,
    }

    /// =============================
    /// Shared Registry
    /// =============================

    public struct GraduationRegistry has key {
        id: object::UID,
        admin: address,
        total_graduated: u64,
        total_registered: u64,
        vault_by_market: Table<address, address>, // market_id -> CreatorTokenVault object id
    }

    /// Shared vault that custody-holds TreasuryCap<T> for one creator token.
    public struct CreatorTokenVault<phantom T> has key, store {
        id: object::UID,
        market_id: address,
        creator: address,
        symbol: vector<u8>,
        name: vector<u8>,
        treasury_cap: TreasuryCap<T>,
    }

    /// =============================
    /// Init
    /// =============================

    fun init(_witness: GRADUATION, ctx: &mut TxContext) {
        let registry = GraduationRegistry {
            id: object::new(ctx),
            admin: tx::sender(ctx),
            total_graduated: 0,
            total_registered: 0,
            vault_by_market: table::new<address, address>(ctx),
        };
        transfer::share_object(registry);
    }

    /// OTW used only for module init.
    public struct GRADUATION has drop {}

    /// =============================
    /// Graduation
    /// =============================

    /// Mark market as graduated, blocking further share buys and sells.
    /// The accumulated SUI treasury is intentionally left in the market;
    /// it is not transferred to the creator.
    public fun graduate(
        registry: &mut GraduationRegistry,
        market: &mut Market,
        ctx: &mut TxContext,
    ) {
        let sender = tx::sender(ctx);
        let creator = share_market::get_market_owner(market);

        assert!(sender == creator, E_NOT_MARKET_OWNER);
        assert!(
            share_market::get_market_holders(market) >= runtime_config::graduation_limit(),
            E_MARKET_NOT_READY
        );
        assert!(!share_market::is_graduated(market), E_ALREADY_GRADUATED);

        share_market::set_graduated(market);
        registry.total_graduated = registry.total_graduated + 1;

        let market_id = object::uid_to_address(share_market::get_market_uid(market));
        event::emit(MarketGraduated {
            market_id,
            creator,
            holders: share_market::get_market_holders(market),
            total_graduated: registry.total_graduated,
        });
    }

    /// Register creator-specific TreasuryCap<T> after publishing a unique token package.
    /// Immediately distributes TOKENS_PER_HOLDER creator tokens to every Phase 1 share holder,
    /// converting their Phase 1 participation into direct token ownership.
    /// Remaining TreasuryCap is moved into a shared vault for platform liquidity operations.
    public entry fun register_creator_token<T>(
        registry: &mut GraduationRegistry,
        market: &Market,
        mut treasury_cap: TreasuryCap<T>,
        symbol: vector<u8>,
        name: vector<u8>,
        ctx: &mut TxContext,
    ) {
        let sender = tx::sender(ctx);
        let creator = share_market::get_market_owner(market);
        assert!(sender == creator, E_NOT_MARKET_OWNER);
        assert!(share_market::is_graduated(market), E_MARKET_NOT_GRADUATED);

        let market_id = object::uid_to_address(share_market::get_market_uid(market));
        assert!(
            !table::contains(&registry.vault_by_market, market_id),
            E_TOKEN_ALREADY_REGISTERED
        );

        // Distribute tokens to every Phase 1 share holder.
        let holder_list = share_market::get_holder_list(market);
        let holder_count = holder_list.length();
        let mut i = 0;
        while (i < holder_count) {
            let holder_addr = holder_list[i];
            let tokens = coin::mint(&mut treasury_cap, TOKENS_PER_HOLDER, ctx);
            transfer::public_transfer(tokens, holder_addr);
            i = i + 1;
        };

        event::emit(TokensDistributed {
            market_id,
            creator,
            holder_count,
            tokens_per_holder: TOKENS_PER_HOLDER,
        });

        let vault = CreatorTokenVault<T> {
            id: object::new(ctx),
            market_id,
            creator,
            symbol,
            name,
            treasury_cap,
        };
        let vault_id = object::uid_to_address(&vault.id);

        table::add(&mut registry.vault_by_market, market_id, vault_id);
        registry.total_registered = registry.total_registered + 1;
        transfer::share_object(vault);

        event::emit(CreatorTokenRegistered {
            market_id,
            creator,
            vault_id,
            symbol,
            name,
            total_registered: registry.total_registered,
        });
    }

    /// Mint tokens for platform liquidity operations (admin-gated).
    public entry fun mint_for_liquidity<T>(
        registry: &GraduationRegistry,
        vault: &mut CreatorTokenVault<T>,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext,
    ) {
        assert!(tx::sender(ctx) == registry.admin, E_NOT_ADMIN);
        let out = coin::mint(&mut vault.treasury_cap, amount, ctx);
        transfer::public_transfer(out, recipient);
    }

    /// Persist the DeepBook pool object ID for a graduated creator token.
    public entry fun register_pool_id<T>(
        registry: &GraduationRegistry,
        vault: &mut CreatorTokenVault<T>,
        pool_id: address,
        ctx: &mut TxContext,
    ) {
        let sender = tx::sender(ctx);
        assert!(sender == vault.creator, E_NOT_MARKET_OWNER);
        assert!(pool_id != @0x0, E_INVALID_POOL_ID);

        let registered_vault_id = *table::borrow(&registry.vault_by_market, vault.market_id);
        let vault_id = object::uid_to_address(&vault.id);
        assert!(registered_vault_id == vault_id, E_VAULT_MISMATCH);

        if (dynamic_field::exists_with_type<u8, address>(&vault.id, POOL_ID_FIELD_NAME)) {
            let _ = dynamic_field::remove<u8, address>(&mut vault.id, POOL_ID_FIELD_NAME);
        };
        dynamic_field::add(&mut vault.id, POOL_ID_FIELD_NAME, pool_id);

        event::emit(CreatorTokenPoolRegistered {
            market_id: vault.market_id,
            creator: vault.creator,
            vault_id,
            pool_id,
        });
    }

    /// Roll back a graduated market that has not yet completed token registration.
    /// Since the SUI treasury was never drained, no repayment is required.
    public entry fun rollback_graduation(
        registry: &mut GraduationRegistry,
        market: &mut Market,
        ctx: &mut TxContext,
    ) {
        let sender = tx::sender(ctx);
        let creator = share_market::get_market_owner(market);
        assert!(sender == creator, E_NOT_MARKET_OWNER);
        assert!(share_market::is_graduated(market), E_MARKET_NOT_GRADUATED);

        let market_id = object::uid_to_address(share_market::get_market_uid(market));
        assert!(
            !table::contains(&registry.vault_by_market, market_id),
            E_TOKEN_ALREADY_REGISTERED
        );

        share_market::set_not_graduated(market);

        if (registry.total_graduated > 0) {
            registry.total_graduated = registry.total_graduated - 1;
        };

        event::emit(MarketGraduationRolledBack {
            market_id,
            creator,
            total_graduated: registry.total_graduated,
        });
    }

    /// =============================
    /// Getters
    /// =============================

    public fun tokens_per_holder(): u64 { TOKENS_PER_HOLDER }

    public fun get_total_graduated(registry: &GraduationRegistry): u64 {
        registry.total_graduated
    }

    public fun get_total_registered(registry: &GraduationRegistry): u64 {
        registry.total_registered
    }

    public fun get_admin(registry: &GraduationRegistry): address {
        registry.admin
    }

    public fun has_registered_token(registry: &GraduationRegistry, market_id: address): bool {
        table::contains(&registry.vault_by_market, market_id)
    }

    public fun get_vault_id(registry: &GraduationRegistry, market_id: address): address {
        *table::borrow(&registry.vault_by_market, market_id)
    }

    public fun get_vault_market_id<T>(vault: &CreatorTokenVault<T>): address { vault.market_id }
    public fun get_vault_creator<T>(vault: &CreatorTokenVault<T>): address { vault.creator }
    public fun get_vault_symbol<T>(vault: &CreatorTokenVault<T>): &vector<u8> { &vault.symbol }
    public fun get_vault_name<T>(vault: &CreatorTokenVault<T>): &vector<u8> { &vault.name }
    public fun get_vault_pool_id<T>(vault: &CreatorTokenVault<T>): address {
        if (dynamic_field::exists_with_type<u8, address>(&vault.id, POOL_ID_FIELD_NAME)) {
            *dynamic_field::borrow<u8, address>(&vault.id, POOL_ID_FIELD_NAME)
        } else {
            @0x0
        }
    }

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(GRADUATION {}, ctx);
    }
}
