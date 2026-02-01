/// Share Market Module (Phase 1, no-withdraw)
/// - Each creator has a Market.
/// - Creator must buy their first share at market creation.
/// - Users can buy/sell ONE share max per wallet.
/// - Total shares (and holders) capped at MAX_SUPPLY = 30.
/// - Bonding curve uses x = holders after buy / current holders for sell:
///   p(x) = 0.02 + 0.35/(x+3) + 1/(38-x) SUI, where x ∈ {1..30}
module cord::share_market {
    use sui::balance::{Self as balance, Balance};
    use sui::coin::{Self as coin, Coin};
    use sui::event;
    use sui::object;
    use sui::sui::SUI;
    use sui::table::{Self as table, Table};
    use sui::transfer;
    use sui::tx_context::{Self as tx, TxContext};

    /// =============================
    /// Constants & Error Codes
    /// =============================

    const MAX_SUPPLY: u64 = 30;

    /// p(x) = BASE + TERM1/(x+3) + TERM2/(38-x)  (in MIST)
    const PRICE_BASE: u64 = 20_000_000;           // 0.02 SUI
    const PRICE_TERM1_NUM: u64 = 350_000_000;     // 0.35 SUI numerator
    const PRICE_TERM2_NUM: u64 = 1_000_000_000;   // 1.0 SUI numerator
    const TERM1_OFFSET: u64 = 3;                  // x + 3
    const TERM2_DENOM_BASE: u64 = 38;             // 38 - x

    const E_SELF_PURCHASE: u64 = 1;
    const E_SUPPLY_LIMIT_EXCEEDED: u64 = 2;
    const E_INSUFFICIENT_PAYMENT: u64 = 3;
    const E_ZERO_SUPPLY: u64 = 4;
    const E_INSUFFICIENT_TREASURY: u64 = 5;
    const E_ALREADY_HOLDER: u64 = 6;
    const E_NOT_HOLDER: u64 = 7;
    const E_INVALID_X: u64 = 8;

    /// =============================
    /// Events
    /// =============================

    public struct SharePurchased has copy, drop {
        buyer: address,
        creator: address,
        price_mist: u64,
        new_holders: u64,
    }

    public struct ShareSold has copy, drop {
        seller: address,
        creator: address,
        refund_mist: u64,
        new_holders: u64,
    }

    /// =============================
    /// Core Objects
    /// =============================

    /// Phase 1 Market:
    /// - holders == supply (1 share per wallet)
    /// - positions tracks whether an address is currently a holder
    public struct Market has key, store {
        id: object::UID,
        owner: address,
        holders: u64,                 // current holders count (0..30)
        treasury: Balance<SUI>,       // accumulated revenue from sales
        positions: Table<address, bool>,
    }

    /// =============================
    /// Creation
    /// =============================

    public entry fun create_market(
        mut payment: Coin<SUI>,
        ctx: &mut TxContext
    ) {
        let sender = tx::sender(ctx);

        // Creator must purchase the first share at p(1)
        let price = price_mist(1);
        let pay_val = coin::value(&payment);
        assert!(pay_val >= price, E_INSUFFICIENT_PAYMENT);

        let pay_coin = coin::split(&mut payment, price, ctx);
        let pay_bal = coin::into_balance(pay_coin);

        let mut market = Market {
            id: object::new(ctx),
            owner: sender,
            holders: 1,
            treasury: balance::zero<SUI>(),
            positions: table::new<address, bool>(ctx),
        };

        balance::join(&mut market.treasury, pay_bal);

        // Return change
        if (coin::value(&payment) > 0) {
            transfer::public_transfer(payment, sender);
        } else {
            coin::destroy_zero(payment);
        };

        // Record creator as the first holder
        table::add(&mut market.positions, sender, true);
        transfer::transfer(market, sender);

        event::emit(SharePurchased {
            buyer: sender,
            creator: sender,
            price_mist: price,
            new_holders: 1,
        });
    }

    /// =============================
    /// Bonding Curve
    /// =============================

    /// Price in MIST for x-th holder/share, x ∈ {1..30}
    fun price_mist(x: u64): u64 {
        assert!(x >= 1 && x <= MAX_SUPPLY, E_INVALID_X);

        let term1 = PRICE_TERM1_NUM / (x + TERM1_OFFSET);
        let term2 = PRICE_TERM2_NUM / (TERM2_DENOM_BASE - x); // safe for x<=30
        PRICE_BASE + term1 + term2
    }

    /// Optional helper for UI quoting: next buy price (aborts if sold out)
    public fun quote_next_buy_price_mist(market: &Market): u64 {
        assert!(market.holders < MAX_SUPPLY, E_SUPPLY_LIMIT_EXCEEDED);
        price_mist(market.holders + 1)
    }

    /// Optional helper for UI quoting: current sell refund (aborts if empty)
    public fun quote_current_sell_refund_mist(market: &Market): u64 {
        assert!(market.holders > 0, E_ZERO_SUPPLY);
        price_mist(market.holders)
    }

    public fun get_market_owner(market: &Market): address { market.owner }
    public fun get_market_holders(market: &Market): u64 { market.holders }
    public fun get_max_supply(): u64 { MAX_SUPPLY }

    /// =============================
    /// Buy (1 share max per wallet)
    /// =============================

    public entry fun buy_share(
        market: &mut Market,
        mut payment: Coin<SUI>,
        ctx: &mut TxContext,
    ) {
        let buyer = tx::sender(ctx);

        // disallow buying own market (keep your original rule)
        assert!(buyer != market.owner, E_SELF_PURCHASE);

        // one share per wallet in Phase 1
        assert!(!table::contains(&market.positions, buyer), E_ALREADY_HOLDER);

        // supply cap
        let new_holders = market.holders + 1;
        assert!(new_holders <= MAX_SUPPLY, E_SUPPLY_LIMIT_EXCEEDED);

        // pricing uses x = holders after buy
        let price = price_mist(new_holders);

        let pay_val = coin::value(&payment);
        assert!(pay_val >= price, E_INSUFFICIENT_PAYMENT);

        // take exact price into treasury
        let pay_coin = coin::split(&mut payment, price, ctx);
        let pay_bal = coin::into_balance(pay_coin);
        balance::join(&mut market.treasury, pay_bal);

        // return change
        if (coin::value(&payment) > 0) {
            transfer::public_transfer(payment, buyer);
        } else {
            coin::destroy_zero(payment);
        };

        // record holder + update state
        table::add(&mut market.positions, buyer, true);
        market.holders = new_holders;

        event::emit(SharePurchased {
            buyer,
            creator: market.owner,
            price_mist: price,
            new_holders,
        });
    }

    /// =============================
    /// Sell (must be a holder)
    /// =============================

    public entry fun sell_share(
        market: &mut Market,
        ctx: &mut TxContext,
    ) {
        let seller = tx::sender(ctx);

        assert!(market.holders > 0, E_ZERO_SUPPLY);
        assert!(table::contains(&market.positions, seller), E_NOT_HOLDER);

        // refund uses x = current holders before sell
        let refund = price_mist(market.holders);

        // ensure treasury can pay (no withdraw in Phase 1, so this is stable)
        let bal_val = balance::value(&market.treasury);
        assert!(bal_val >= refund, E_INSUFFICIENT_TREASURY);

        let out_bal = balance::split(&mut market.treasury, refund);
        let out_coin = coin::from_balance(out_bal, ctx);
        transfer::public_transfer(out_coin, seller);

        // update holder table + state
        table::remove(&mut market.positions, seller);
        market.holders = market.holders - 1;

        event::emit(ShareSold {
            seller,
            creator: market.owner,
            refund_mist: refund,
            new_holders: market.holders,
        });
    }
}
