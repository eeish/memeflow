/// Share Market Module (Phase 1, no-withdraw)
/// - Each creator has a Market.
/// - Creator must buy their first share at market creation.
/// - Users can buy/sell ONE share max per wallet.
/// - Total shares (and holders) are capped by runtime_config::max_supply().
/// - Bonding curve uses x = holders after buy / current holders for sell:
///   p(x) = 0.02 + 0.35/(x+3) + 1/(TERM2_DENOM_BASE-x) SUI,
///   where TERM2_DENOM_BASE is generated from deploy config.
/// - Sells incur a 15% fee (SELL_FEE_BPS) retained in the treasury.
/// - Graduation eligibility is based on total_buys (cumulative), not current holders.
module cord::share_market {
    use cord::runtime_config;
    use sui::balance::{Self as balance, Balance};
    use sui::coin::{Self as coin, Coin};
    use sui::event;
    use sui::sui::SUI;
    use sui::table::{Self as table, Table};
    use sui::tx_context::{Self as tx};

    /// =============================
    /// Constants & Error Codes
    /// =============================

    /// p(x) = BASE + TERM1/(x+3) + TERM2/(TERM2_DENOM_BASE-x) (in MIST)
    const PRICE_BASE: u64 = 20_000_000;           // 0.02 SUI
    const PRICE_TERM1_NUM: u64 = 350_000_000;     // 0.35 SUI numerator
    const PRICE_TERM2_NUM: u64 = 1_000_000_000;   // 1.0 SUI numerator
    const TERM1_OFFSET: u64 = 3;                  // x + 3

    /// 15% sell fee retained in treasury; seller receives 85% of gross refund.
    const SELL_FEE_BPS: u64 = 1_500;
    const BPS_DENOMINATOR: u64 = 10_000;

    const E_SELF_PURCHASE: u64 = 1;
    const E_SUPPLY_LIMIT_EXCEEDED: u64 = 2;
    const E_INSUFFICIENT_PAYMENT: u64 = 3;
    const E_ZERO_SUPPLY: u64 = 4;
    const E_INSUFFICIENT_TREASURY: u64 = 5;
    const E_ALREADY_HOLDER: u64 = 6;
    const E_NOT_HOLDER: u64 = 7;
    const E_INVALID_X: u64 = 8;
    const E_MARKET_GRADUATED: u64 = 9;

    /// =============================
    /// Events
    /// =============================

    public struct SharePurchased has copy, drop {
        market_id: address,
        buyer: address,
        creator: address,
        price_mist: u64,
        new_holders: u64,
    }

    public struct ShareSold has copy, drop {
        market_id: address,
        seller: address,
        creator: address,
        refund_mist: u64,   // net payout to seller (after 15% fee)
        fee_mist: u64,      // amount retained in treasury
        new_holders: u64,
    }

    /// =============================
    /// Core Objects
    /// =============================

    /// Phase 1 Market:
    /// - holders == supply (1 share per wallet)
    /// - positions tracks whether an address is currently a holder
    /// - total_buys is the cumulative buy count (never decremented on sell);
    ///   graduation eligibility is checked against this, not holders.
    public struct Market has key, store {
        id: object::UID,
        owner: address,
        holders: u64,                 // current holders count (0..max_supply)
        total_buys: u64,              // cumulative buys; used for graduation threshold
        treasury: Balance<SUI>,       // accumulated revenue from sales
        positions: Table<address, bool>,
        holder_list: vector<address>, // iterable holder addresses for graduation
        graduated: bool,              // blocks buy/sell after graduation
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
            total_buys: 1,
            treasury: balance::zero<SUI>(),
            positions: table::new<address, bool>(ctx),
            holder_list: vector[sender],
            graduated: false,
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

        // Get market ID before sharing
        let market_id = object::uid_to_address(&market.id);

        // Share the market so anyone can buy/sell shares
        transfer::share_object(market);

        event::emit(SharePurchased {
            market_id,
            buyer: sender,
            creator: sender,
            price_mist: price,
            new_holders: 1,
        });
    }

    /// =============================
    /// Bonding Curve
    /// =============================

    /// Price in MIST for x-th holder/share, x ∈ {1..max_supply}
    fun price_mist(x: u64): u64 {
        let max_supply = runtime_config::max_supply();
        assert!(x >= 1 && x <= max_supply, E_INVALID_X);

        let term1 = PRICE_TERM1_NUM / (x + TERM1_OFFSET);
        let term2 = PRICE_TERM2_NUM / (runtime_config::term2_denom_base() - x);
        PRICE_BASE + term1 + term2
    }

    /// Optional helper for UI quoting: next buy price (aborts if sold out)
    public fun quote_next_buy_price_mist(market: &Market): u64 {
        assert!(market.holders < runtime_config::max_supply(), E_SUPPLY_LIMIT_EXCEEDED);
        price_mist(market.holders + 1)
    }

    /// Optional helper for UI quoting: current sell refund (aborts if empty)
    /// Returns the net refund a seller would receive (gross minus 15% fee).
    public fun quote_current_sell_refund_mist(market: &Market): u64 {
        assert!(market.holders > 0, E_ZERO_SUPPLY);
        let gross = price_mist(market.holders);
        gross * (BPS_DENOMINATOR - SELL_FEE_BPS) / BPS_DENOMINATOR
    }

    public fun get_market_owner(market: &Market): address { market.owner }
    public fun get_market_holders(market: &Market): u64 { market.holders }
    public fun get_total_buys(market: &Market): u64 { market.total_buys }
    public fun get_max_supply(): u64 { runtime_config::max_supply() }

    /// =============================
    /// Buy (1 share max per wallet)
    /// =============================

    public entry fun buy_share(
        market: &mut Market,
        mut payment: Coin<SUI>,
        ctx: &mut TxContext,
    ) {
        let buyer = tx::sender(ctx);

        // cannot buy after graduation
        assert!(!market.graduated, E_MARKET_GRADUATED);

        // disallow buying own market (keep your original rule)
        assert!(buyer != market.owner, E_SELF_PURCHASE);

        // one share per wallet in Phase 1
        assert!(!table::contains(&market.positions, buyer), E_ALREADY_HOLDER);

        // supply cap
        let new_holders = market.holders + 1;
        assert!(new_holders <= runtime_config::max_supply(), E_SUPPLY_LIMIT_EXCEEDED);

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
        market.holder_list.push_back(buyer);
        market.holders = new_holders;
        market.total_buys = market.total_buys + 1;

        event::emit(SharePurchased {
            market_id: object::uid_to_address(&market.id),
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

        // cannot sell after graduation
        assert!(!market.graduated, E_MARKET_GRADUATED);

        assert!(market.holders > 0, E_ZERO_SUPPLY);
        assert!(table::contains(&market.positions, seller), E_NOT_HOLDER);

        // gross refund = bonding curve price at current holders
        // net refund (85%) is paid to the seller; the 15% fee stays in treasury.
        let gross = price_mist(market.holders);
        let net_refund = gross * (BPS_DENOMINATOR - SELL_FEE_BPS) / BPS_DENOMINATOR;
        let fee = gross - net_refund;

        // treasury only needs to cover the net payout; fee portion was never deducted.
        let bal_val = balance::value(&market.treasury);
        assert!(bal_val >= net_refund, E_INSUFFICIENT_TREASURY);

        let out_bal = balance::split(&mut market.treasury, net_refund);
        let out_coin = coin::from_balance(out_bal, ctx);
        transfer::public_transfer(out_coin, seller);
        // `fee` remains in market.treasury implicitly (no split performed).

        // update holder table + state
        table::remove(&mut market.positions, seller);

        // remove seller from holder_list via swap-remove
        let len = market.holder_list.length();
        let mut i = 0;
        while (i < len) {
            if (market.holder_list[i] == seller) {
                market.holder_list.swap_remove(i);
                break
            };
            i = i + 1;
        };

        market.holders = market.holders - 1;

        event::emit(ShareSold {
            market_id: object::uid_to_address(&market.id),
            seller,
            creator: market.owner,
            refund_mist: net_refund,
            fee_mist: fee,
            new_holders: market.holders,
        });
    }

    /// =============================
    /// Graduation Accessors
    /// =============================

    public fun is_graduated(market: &Market): bool { market.graduated }

    public(package) fun get_holder_list(market: &Market): &vector<address> {
        &market.holder_list
    }

    public(package) fun drain_treasury(market: &mut Market): Balance<SUI> {
        let amount = balance::value(&market.treasury);
        balance::split(&mut market.treasury, amount)
    }

    public(package) fun set_graduated(market: &mut Market) {
        market.graduated = true;
    }

    public(package) fun set_not_graduated(market: &mut Market) {
        market.graduated = false;
    }

    public(package) fun add_to_treasury(market: &mut Market, funds: Balance<SUI>) {
        balance::join(&mut market.treasury, funds);
    }

    public(package) fun get_market_uid(market: &Market): &object::UID {
        &market.id
    }
}
