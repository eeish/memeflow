#[test_only]
module cord::share_market_tests {
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::test_scenario::{Self as ts};
    use sui::test_utils::{assert_eq};

    use cord::share_market::{Self, Market};

    const CREATOR: address = @0xC0;
    const ALICE: address = @0xA11CE;
    const BOB: address = @0xB0B;

    /// Helper: create a market for `creator` (buys first share at p(1))
    fun setup_market(scenario: &mut ts::Scenario, creator: address) {
        ts::next_tx(scenario, creator);
        {
            let ctx = ts::ctx(scenario);
            let payment = coin::mint_for_testing<SUI>(200_000_000, ctx); // > p(1)
            share_market::create_market(payment, ctx);
        };
    }

    /// Helper: get the price for the x-th holder (1-indexed)
    fun price_mist(x: u64): u64 {
        // p(x) = 0.02 + 0.35/(x+3) + 1/(term2_denom_base-x) SUI in MIST
        let base: u64 = 20_000_000;
        let term1: u64 = 350_000_000 / (x + 3);
        let term2_denom_base = share_market::get_max_supply() + 8;
        let term2: u64 = 1_000_000_000 / (term2_denom_base - x);
        base + term1 + term2
    }

    // ==========================================
    // Market creation
    // ==========================================

    #[test]
    fun test_create_market() {
        let mut scenario = ts::begin(CREATOR);
        setup_market(&mut scenario, CREATOR);

        ts::next_tx(&mut scenario, CREATOR);
        {
            let market = ts::take_shared<Market>(&scenario);
            assert_eq(share_market::get_market_holders(&market), 1);
            assert_eq(share_market::get_market_owner(&market), CREATOR);
            assert_eq(share_market::is_graduated(&market), false);
            ts::return_shared(market);
        };

        // Creator should get change back
        ts::next_tx(&mut scenario, CREATOR);
        {
            let change = ts::take_from_sender<Coin<SUI>>(&scenario);
            // paid 200M, price p(1) = 134_527_027, change = 65_472_973
            assert_eq(coin::value(&change), 200_000_000 - price_mist(1));
            ts::return_to_sender(&scenario, change);
        };

        ts::end(scenario);
    }

    // ==========================================
    // Bonding curve pricing
    // ==========================================

    #[test]
    fun test_bonding_curve_pricing() {
        let mut scenario = ts::begin(CREATOR);
        setup_market(&mut scenario, CREATOR);

        ts::next_tx(&mut scenario, ALICE);
        {
            let market = ts::take_shared<Market>(&scenario);
            // Market has 1 holder (creator), next buy = p(2)
            let next_price = share_market::quote_next_buy_price_mist(&market);
            assert_eq(next_price, price_mist(2));
            ts::return_shared(market);
        };

        let max_supply = share_market::get_max_supply();
        assert!(max_supply >= 2, 0);

        // The last slot always uses TERM2 denominator 8 by config generation.
        let expected_last = 20_000_000 + 350_000_000 / (max_supply + 3) + 1_000_000_000 / 8;
        assert_eq(price_mist(max_supply), expected_last);

        ts::end(scenario);
    }

    #[test]
    fun test_u_shaped_curve() {
        let max_supply = share_market::get_max_supply();
        if (max_supply >= 3) {
            let p_start = price_mist(1);
            let p_mid = price_mist((max_supply + 1) / 2);
            let p_end = price_mist(max_supply);
            assert!(p_mid < p_start, 0);
            assert!(p_mid < p_end, 1);
        };
    }

    // ==========================================
    // Buy share
    // ==========================================

    #[test]
    fun test_buy_share_exact() {
        let mut scenario = ts::begin(CREATOR);
        setup_market(&mut scenario, CREATOR);

        // Alice buys (becomes holder #2)
        ts::next_tx(&mut scenario, ALICE);
        {
            let mut market = ts::take_shared<Market>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let price = price_mist(2); // p(2) since creator is holder #1
            let payment = coin::mint_for_testing<SUI>(price, ctx);
            share_market::buy_share(&mut market, payment, ctx);
            assert_eq(share_market::get_market_holders(&market), 2);
            ts::return_shared(market);
        };

        ts::end(scenario);
    }

    #[test]
    fun test_buy_share_with_change() {
        let mut scenario = ts::begin(CREATOR);
        setup_market(&mut scenario, CREATOR);

        ts::next_tx(&mut scenario, ALICE);
        {
            let mut market = ts::take_shared<Market>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let price = price_mist(2);
            let overpayment = price + 100_000_000;
            let payment = coin::mint_for_testing<SUI>(overpayment, ctx);
            share_market::buy_share(&mut market, payment, ctx);
            assert_eq(share_market::get_market_holders(&market), 2);
            ts::return_shared(market);
        };

        ts::next_tx(&mut scenario, ALICE);
        {
            let change = ts::take_from_sender<Coin<SUI>>(&scenario);
            assert_eq(coin::value(&change), 100_000_000);
            ts::return_to_sender(&scenario, change);
        };

        ts::end(scenario);
    }

    // ==========================================
    // Sell share
    // ==========================================

    #[test]
    fun test_sell_share() {
        let mut scenario = ts::begin(CREATOR);
        setup_market(&mut scenario, CREATOR);

        // Alice buys
        ts::next_tx(&mut scenario, ALICE);
        {
            let mut market = ts::take_shared<Market>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let price = price_mist(2);
            let payment = coin::mint_for_testing<SUI>(price, ctx);
            share_market::buy_share(&mut market, payment, ctx);
            ts::return_shared(market);
        };

        // Alice sells
        ts::next_tx(&mut scenario, ALICE);
        {
            let mut market = ts::take_shared<Market>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            share_market::sell_share(&mut market, ctx);
            assert_eq(share_market::get_market_holders(&market), 1);
            ts::return_shared(market);
        };

        // Alice receives refund = p(2) (price of last holder)
        ts::next_tx(&mut scenario, ALICE);
        {
            let refund = ts::take_from_sender<Coin<SUI>>(&scenario);
            assert_eq(coin::value(&refund), price_mist(2));
            ts::return_to_sender(&scenario, refund);
        };

        ts::end(scenario);
    }

    // ==========================================
    // Multiple purchases
    // ==========================================

    #[test]
    fun test_multiple_purchases() {
        let mut scenario = ts::begin(CREATOR);
        setup_market(&mut scenario, CREATOR);

        // Alice buys (holder #2)
        ts::next_tx(&mut scenario, ALICE);
        {
            let mut market = ts::take_shared<Market>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let payment = coin::mint_for_testing<SUI>(price_mist(2), ctx);
            share_market::buy_share(&mut market, payment, ctx);
            ts::return_shared(market);
        };

        // Bob buys (holder #3)
        ts::next_tx(&mut scenario, BOB);
        {
            let mut market = ts::take_shared<Market>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let payment = coin::mint_for_testing<SUI>(price_mist(3), ctx);
            share_market::buy_share(&mut market, payment, ctx);
            assert_eq(share_market::get_market_holders(&market), 3);
            ts::return_shared(market);
        };

        ts::end(scenario);
    }

    // ==========================================
    // Error cases
    // ==========================================

    #[test]
    #[expected_failure(abort_code = share_market::E_SELF_PURCHASE)]
    fun test_cannot_buy_own_shares() {
        let mut scenario = ts::begin(CREATOR);
        setup_market(&mut scenario, CREATOR);

        ts::next_tx(&mut scenario, CREATOR);
        {
            let mut market = ts::take_shared<Market>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let payment = coin::mint_for_testing<SUI>(200_000_000, ctx);
            share_market::buy_share(&mut market, payment, ctx);
            ts::return_shared(market);
        };

        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = share_market::E_NOT_HOLDER)]
    fun test_cannot_sell_without_holding() {
        let mut scenario = ts::begin(CREATOR);
        setup_market(&mut scenario, CREATOR);

        ts::next_tx(&mut scenario, ALICE);
        {
            let mut market = ts::take_shared<Market>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            share_market::sell_share(&mut market, ctx);
            ts::return_shared(market);
        };

        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = share_market::E_ALREADY_HOLDER)]
    fun test_cannot_buy_twice() {
        let mut scenario = ts::begin(CREATOR);
        setup_market(&mut scenario, CREATOR);

        // Alice buys
        ts::next_tx(&mut scenario, ALICE);
        {
            let mut market = ts::take_shared<Market>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let payment = coin::mint_for_testing<SUI>(price_mist(2), ctx);
            share_market::buy_share(&mut market, payment, ctx);
            ts::return_shared(market);
        };

        // Alice tries to buy again
        ts::next_tx(&mut scenario, ALICE);
        {
            let mut market = ts::take_shared<Market>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let payment = coin::mint_for_testing<SUI>(price_mist(3), ctx);
            share_market::buy_share(&mut market, payment, ctx);
            ts::return_shared(market);
        };

        ts::end(scenario);
    }
}
