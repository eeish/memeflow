#[test_only]
module cord::share_market_tests {
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::test_scenario::{Self as ts};
    use sui::test_utils::{assert_eq};

    use cord::share_market::{Self, Market};

    const ALICE: address = @0xA11CE;
    const BOB: address = @0xB0B;

    /// Test basic market creation
    #[test]
    fun test_create_market() {
        let mut scenario = ts::begin(ALICE);

        // Alice creates her market
        {
            let ctx = ts::ctx(&mut scenario);
            share_market::create_market(ctx);
        };

        // Verify Market was created
        ts::next_tx(&mut scenario, ALICE);
        {
            let market = ts::take_from_sender<Market>(&scenario);
            assert_eq(share_market::get_market_supply(&market), 0);
            ts::return_to_sender(&scenario, market);
        };

        ts::end(scenario);
    }

    /// Test bonding curve pricing: p(x) = 0.02 + 0.35/(x+3) + 1/(38-x) SUI
    /// Prices in MIST (1 SUI = 1e9 MIST)
    #[test]
    fun test_bonding_curve_pricing() {
        // p(1) = 20M + 350M/4 + 1000M/37 = 20M + 87.5M + 27.027M
        // Integer division: 87_500_000 + 27_027_027 + 20_000_000 = 134_527_027
        assert_eq(share_market::next_buy_price_mist(0), 134_527_027);

        // p(10) = 20M + 350M/13 + 1000M/28
        // = 20_000_000 + 26_923_076 + 35_714_285 = 82_637_361
        assert_eq(share_market::next_buy_price_mist(9), 82_637_361);

        // p(15) = 20M + 350M/18 + 1000M/23
        // = 20_000_000 + 19_444_444 + 43_478_260 = 82_922_704
        assert_eq(share_market::next_buy_price_mist(14), 82_922_704);

        // p(30) = 20M + 350M/33 + 1000M/8
        // = 20_000_000 + 10_606_060 + 125_000_000 = 155_606_060
        assert_eq(share_market::next_buy_price_mist(29), 155_606_060);

        // Max supply is 30
        assert_eq(share_market::get_max_supply(), 30);
    }

    /// Test U-shaped curve: middle prices are lower than edge prices
    #[test]
    fun test_u_shaped_curve() {
        let p1 = share_market::next_buy_price_mist(0);   // p(1)
        let p15 = share_market::next_buy_price_mist(14); // p(15)
        let p30 = share_market::next_buy_price_mist(29); // p(30)

        // Middle price (p15) should be lower than edge prices (p1, p30)
        assert!(p15 < p1, 0);
        assert!(p15 < p30, 1);
    }

    /// Test share purchase with exact payment
    #[test]
    fun test_buy_share_exact() {
        let mut scenario = ts::begin(ALICE);

        // Setup: Create Bob's market
        ts::next_tx(&mut scenario, BOB);
        {
            let ctx = ts::ctx(&mut scenario);
            share_market::create_market(ctx);
        };

        // Alice buys Bob's first share with exact payment
        ts::next_tx(&mut scenario, ALICE);
        {
            let mut bob_market = ts::take_from_address<Market>(&scenario, BOB);
            let ctx = ts::ctx(&mut scenario);

            // Price for first share: p(1) = 134_527_027 MIST
            let price = share_market::next_buy_price_mist(0);
            assert_eq(price, 134_527_027);

            let payment = coin::mint_for_testing<SUI>(price, ctx);
            share_market::buy_share(&mut bob_market, payment, ctx);

            assert_eq(share_market::get_market_supply(&bob_market), 1);

            ts::return_to_address(BOB, bob_market);
        };

        ts::end(scenario);
    }

    /// Test share purchase with overpayment (should return change)
    #[test]
    fun test_buy_share_with_change() {
        let mut scenario = ts::begin(ALICE);

        // Setup: Create Bob's market
        ts::next_tx(&mut scenario, BOB);
        {
            let ctx = ts::ctx(&mut scenario);
            share_market::create_market(ctx);
        };

        // Alice buys Bob's share with overpayment
        ts::next_tx(&mut scenario, ALICE);
        {
            let mut bob_market = ts::take_from_address<Market>(&scenario, BOB);
            let ctx = ts::ctx(&mut scenario);

            let price = share_market::next_buy_price_mist(0);
            let overpayment = price + 100_000_000; // Add 0.1 SUI extra

            let payment = coin::mint_for_testing<SUI>(overpayment, ctx);
            share_market::buy_share(&mut bob_market, payment, ctx);

            assert_eq(share_market::get_market_supply(&bob_market), 1);

            ts::return_to_address(BOB, bob_market);
        };

        // Verify Alice received change
        ts::next_tx(&mut scenario, ALICE);
        {
            let change = ts::take_from_sender<Coin<SUI>>(&scenario);
            assert_eq(coin::value(&change), 100_000_000);
            ts::return_to_sender(&scenario, change);
        };

        ts::end(scenario);
    }

    /// Test share sale with refund
    #[test]
    fun test_sell_share_with_refund() {
        let mut scenario = ts::begin(ALICE);

        // Setup: Create Bob's market
        ts::next_tx(&mut scenario, BOB);
        {
            let ctx = ts::ctx(&mut scenario);
            share_market::create_market(ctx);
        };

        // Alice buys Bob's share
        ts::next_tx(&mut scenario, ALICE);
        {
            let mut bob_market = ts::take_from_address<Market>(&scenario, BOB);
            let ctx = ts::ctx(&mut scenario);

            let price = share_market::next_buy_price_mist(0); // p(1)
            let payment = coin::mint_for_testing<SUI>(price, ctx);
            share_market::buy_share(&mut bob_market, payment, ctx);

            ts::return_to_address(BOB, bob_market);
        };

        // Alice sells Bob's share
        ts::next_tx(&mut scenario, ALICE);
        {
            let mut bob_market = ts::take_from_address<Market>(&scenario, BOB);
            let ctx = ts::ctx(&mut scenario);

            share_market::sell_share(&mut bob_market, ctx);

            assert_eq(share_market::get_market_supply(&bob_market), 0);

            ts::return_to_address(BOB, bob_market);
        };

        // Verify Alice received refund (same as buy price for supply=1)
        ts::next_tx(&mut scenario, ALICE);
        {
            let refund = ts::take_from_sender<Coin<SUI>>(&scenario);
            assert_eq(coin::value(&refund), 134_527_027); // p(1)
            ts::return_to_sender(&scenario, refund);
        };

        ts::end(scenario);
    }

    /// Test multiple share purchases (price changes according to U-curve)
    #[test]
    fun test_multiple_purchases() {
        let mut scenario = ts::begin(ALICE);

        // Setup: Create Bob's market
        ts::next_tx(&mut scenario, BOB);
        {
            let ctx = ts::ctx(&mut scenario);
            share_market::create_market(ctx);
        };

        // First purchase: p(1)
        ts::next_tx(&mut scenario, ALICE);
        {
            let mut bob_market = ts::take_from_address<Market>(&scenario, BOB);
            let ctx = ts::ctx(&mut scenario);

            let price1 = share_market::next_buy_price_mist(0);
            assert_eq(price1, 134_527_027);

            let payment = coin::mint_for_testing<SUI>(price1, ctx);
            share_market::buy_share(&mut bob_market, payment, ctx);

            ts::return_to_address(BOB, bob_market);
        };

        // Second purchase: p(2) = 20M + 350M/5 + 1000M/36 = 20M + 70M + 27.78M
        ts::next_tx(&mut scenario, ALICE);
        {
            let mut bob_market = ts::take_from_address<Market>(&scenario, BOB);
            let ctx = ts::ctx(&mut scenario);

            let price2 = share_market::next_buy_price_mist(1);
            // 20_000_000 + 70_000_000 + 27_777_777 = 117_777_777
            assert_eq(price2, 117_777_777);

            let payment = coin::mint_for_testing<SUI>(price2, ctx);
            share_market::buy_share(&mut bob_market, payment, ctx);

            assert_eq(share_market::get_market_supply(&bob_market), 2);

            ts::return_to_address(BOB, bob_market);
        };

        ts::end(scenario);
    }

    /// Test creator treasury withdrawal
    #[test]
    fun test_withdraw_treasury() {
        let mut scenario = ts::begin(BOB);

        // Setup: Create Bob's market
        {
            let ctx = ts::ctx(&mut scenario);
            share_market::create_market(ctx);
        };

        // Alice buys Bob's share with payment
        ts::next_tx(&mut scenario, ALICE);
        {
            let mut bob_market = ts::take_from_address<Market>(&scenario, BOB);
            let ctx = ts::ctx(&mut scenario);

            let price = share_market::next_buy_price_mist(0);
            let payment = coin::mint_for_testing<SUI>(price, ctx);
            share_market::buy_share(&mut bob_market, payment, ctx);

            ts::return_to_address(BOB, bob_market);
        };

        // Bob withdraws from treasury
        ts::next_tx(&mut scenario, BOB);
        {
            let mut bob_market = ts::take_from_sender<Market>(&scenario);
            let ctx = ts::ctx(&mut scenario);

            // Withdraw 50M MIST (0.05 SUI)
            share_market::withdraw_treasury(&mut bob_market, 50_000_000, ctx);

            ts::return_to_sender(&scenario, bob_market);
        };

        // Verify Bob received the withdrawal
        ts::next_tx(&mut scenario, BOB);
        {
            let withdrawal = ts::take_from_sender<Coin<SUI>>(&scenario);
            assert_eq(coin::value(&withdrawal), 50_000_000);
            ts::return_to_sender(&scenario, withdrawal);
        };

        ts::end(scenario);
    }

    /// Test cannot buy own shares
    #[test]
    #[expected_failure(abort_code = share_market::E_SELF_PURCHASE)]
    fun test_cannot_buy_own_shares() {
        let mut scenario = ts::begin(ALICE);

        // Alice creates her market
        {
            let ctx = ts::ctx(&mut scenario);
            share_market::create_market(ctx);
        };

        // Alice tries to buy her own shares (should fail)
        ts::next_tx(&mut scenario, ALICE);
        {
            let mut alice_market = ts::take_from_sender<Market>(&scenario);
            let ctx = ts::ctx(&mut scenario);

            let payment = coin::mint_for_testing<SUI>(200_000_000, ctx);
            share_market::buy_share(&mut alice_market, payment, ctx);

            ts::return_to_sender(&scenario, alice_market);
        };

        ts::end(scenario);
    }

    /// Test cannot sell when supply is zero
    #[test]
    #[expected_failure(abort_code = share_market::E_ZERO_SUPPLY)]
    fun test_cannot_sell_zero_supply() {
        let mut scenario = ts::begin(BOB);

        // Create Bob's market
        {
            let ctx = ts::ctx(&mut scenario);
            share_market::create_market(ctx);
        };

        // Alice tries to sell when supply is 0 (should fail)
        ts::next_tx(&mut scenario, ALICE);
        {
            let mut bob_market = ts::take_from_address<Market>(&scenario, BOB);
            let ctx = ts::ctx(&mut scenario);

            share_market::sell_share(&mut bob_market, ctx);

            ts::return_to_address(BOB, bob_market);
        };

        ts::end(scenario);
    }

    /// Test cannot exceed max supply (30 shares)
    #[test]
    #[expected_failure(abort_code = share_market::E_SUPPLY_LIMIT_EXCEEDED)]
    fun test_cannot_exceed_max_supply() {
        let mut scenario = ts::begin(BOB);

        // Create Bob's market
        {
            let ctx = ts::ctx(&mut scenario);
            share_market::create_market(ctx);
        };

        // Buy 30 shares (should succeed)
        let mut i = 0;
        while (i < 30) {
            ts::next_tx(&mut scenario, ALICE);
            {
                let mut bob_market = ts::take_from_address<Market>(&scenario, BOB);
                let ctx = ts::ctx(&mut scenario);

                let price = share_market::next_buy_price_mist(i);
                let payment = coin::mint_for_testing<SUI>(price, ctx);
                share_market::buy_share(&mut bob_market, payment, ctx);

                ts::return_to_address(BOB, bob_market);
            };
            i = i + 1;
        };

        // Try to buy 31st share (should fail)
        ts::next_tx(&mut scenario, ALICE);
        {
            let mut bob_market = ts::take_from_address<Market>(&scenario, BOB);
            let ctx = ts::ctx(&mut scenario);

            // This should fail - supply limit exceeded
            let payment = coin::mint_for_testing<SUI>(500_000_000, ctx);
            share_market::buy_share(&mut bob_market, payment, ctx);

            ts::return_to_address(BOB, bob_market);
        };

        ts::end(scenario);
    }
}
