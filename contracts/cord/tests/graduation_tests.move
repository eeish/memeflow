#[test_only]
module cord::graduation_tests {
    use sui::coin::{Self as coin, Coin};
    use sui::sui::SUI;
    use sui::test_scenario::{Self as ts};
    use sui::test_utils::{assert_eq};

    use cord::graduation::{Self, GraduationRegistry};
    use cord::phase2_amm;
    use cord::share_market::{Self, Market};

    const CREATOR: address = @0xC0;
    const H2: address = @0x1002;
    const H3: address = @0x1003;
    const H4: address = @0x1004;
    const H5: address = @0x1005;
    const H6: address = @0x1006;
    const H7: address = @0x1007;
    const H8: address = @0x1008;
    const H9: address = @0x1009;
    const H10: address = @0x100A;
    const OPERATOR: address = @0xA11CE;
    const TRADER: address = @0xB0B;

    /// Test-only coin type to simulate a creator-specific published coin.
    public struct TEST_TOKEN has drop {}

    const HOLDER_ADDRS: vector<address> = vector[
        @0x0, @0x0, // placeholders for index 0,1
        H2, H3, H4, H5, H6, H7, H8, H9, H10,
    ];

    fun holder_addr(i: u64): address {
        HOLDER_ADDRS[i]
    }

    /// Helper: compute price for x-th holder (1-indexed)
    fun price_mist(x: u64): u64 {
        let term2_denom_base = share_market::get_max_supply() + 8;
        20_000_000 + 350_000_000 / (x + 3) + 1_000_000_000 / (term2_denom_base - x)
    }

    /// Helper: init graduation module (creates registry)
    fun setup_graduation(scenario: &mut ts::Scenario) {
        ts::next_tx(scenario, @0x0);
        {
            graduation::init_for_testing(ts::ctx(scenario));
        };
    }

    /// Helper: create market and fill until configured max supply.
    fun setup_full_market(scenario: &mut ts::Scenario) {
        let max_supply = share_market::get_max_supply();
        let max_supported = HOLDER_ADDRS.length() - 1;
        assert!(max_supply <= max_supported, 700);

        // Creator creates market (holder #1), paying the exact price so no change is returned.
        ts::next_tx(scenario, CREATOR);
        {
            let ctx = ts::ctx(scenario);
            let payment = coin::mint_for_testing<SUI>(price_mist(1), ctx);
            share_market::create_market(payment, ctx);
        };

        // Fill holders #2 through #max_supply
        let mut i = 2u64;
        while (i <= max_supply) {
            let buyer = holder_addr(i);
            ts::next_tx(scenario, buyer);
            {
                let mut market = ts::take_shared<Market>(scenario);
                let ctx = ts::ctx(scenario);
                let payment = coin::mint_for_testing<SUI>(price_mist(i), ctx);
                share_market::buy_share(&mut market, payment, ctx);
                ts::return_shared(market);
            };
            i = i + 1;
        };
    }

    #[test]
    fun test_full_graduation_flow() {
        let mut scenario = ts::begin(CREATOR);
        setup_graduation(&mut scenario);
        setup_full_market(&mut scenario);

        // Creator graduates
        ts::next_tx(&mut scenario, CREATOR);
        {
            let mut market = ts::take_shared<Market>(&scenario);
            let mut registry = ts::take_shared<GraduationRegistry>(&scenario);
            let ctx = ts::ctx(&mut scenario);

            graduation::graduate(&mut registry, &mut market, ctx);

            assert_eq(share_market::is_graduated(&market), true);
            assert_eq(graduation::get_total_graduated(&registry), 1);

            ts::return_shared(market);
            ts::return_shared(registry);
        };

        // Creator must NOT receive a SUI coin — the treasury stays in the market.
        ts::next_tx(&mut scenario, CREATOR);
        {
            assert!(!ts::has_most_recent_for_sender<Coin<SUI>>(&scenario), 0);
        };

        ts::end(scenario);
    }

    #[test]
    fun test_register_creator_token_vault() {
        let mut scenario = ts::begin(CREATOR);
        setup_graduation(&mut scenario);
        setup_full_market(&mut scenario);

        // Graduate first
        ts::next_tx(&mut scenario, CREATOR);
        {
            let mut market = ts::take_shared<Market>(&scenario);
            let mut registry = ts::take_shared<GraduationRegistry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            graduation::graduate(&mut registry, &mut market, ctx);
            ts::return_shared(market);
            ts::return_shared(registry);
        };

        // Register TreasuryCap<TEST_TOKEN> — this distributes tokens to all holders.
        // Use create_treasury_cap_for_testing to bypass the OTW check; the real flow
        // requires a properly published one-time-witness coin package.
        ts::next_tx(&mut scenario, CREATOR);
        {
            let market = ts::take_shared<Market>(&scenario);
            let mut registry = ts::take_shared<GraduationRegistry>(&scenario);
            let ctx = ts::ctx(&mut scenario);

            let treasury_cap = coin::create_treasury_cap_for_testing<TEST_TOKEN>(ctx);

            graduation::register_creator_token<TEST_TOKEN>(
                &mut registry,
                &market,
                treasury_cap,
                b"TTEST",
                b"Test Creator Token",
                ctx,
            );

            let market_addr = object::uid_to_address(share_market::get_market_uid(&market));
            assert_eq(graduation::has_registered_token(&registry, market_addr), true);
            assert_eq(graduation::get_total_registered(&registry), 1);

            ts::return_shared(market);
            ts::return_shared(registry);
        };

        // Verify CREATOR received TOKENS_PER_HOLDER TEST_TOKEN (they are holder #1).
        ts::next_tx(&mut scenario, CREATOR);
        {
            let tokens = ts::take_from_sender<Coin<TEST_TOKEN>>(&scenario);
            assert_eq(coin::value(&tokens), graduation::tokens_per_holder());
            ts::return_to_sender(&scenario, tokens);
        };

        // Verify H2 received TOKENS_PER_HOLDER TEST_TOKEN (holder #2).
        ts::next_tx(&mut scenario, H2);
        {
            let tokens = ts::take_from_sender<Coin<TEST_TOKEN>>(&scenario);
            assert_eq(coin::value(&tokens), graduation::tokens_per_holder());
            ts::return_to_sender(&scenario, tokens);
        };

        ts::end(scenario);
    }

    #[test]
    fun test_initialize_amm_pool_and_swaps() {
        let mut scenario = ts::begin(CREATOR);
        setup_graduation(&mut scenario);
        setup_full_market(&mut scenario);

        // Graduate first
        ts::next_tx(&mut scenario, CREATOR);
        {
            let mut market = ts::take_shared<Market>(&scenario);
            let mut registry = ts::take_shared<GraduationRegistry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            graduation::graduate(&mut registry, &mut market, ctx);
            ts::return_shared(market);
            ts::return_shared(registry);
        };

        // Register the creator token
        ts::next_tx(&mut scenario, CREATOR);
        {
            let market = ts::take_shared<Market>(&scenario);
            let mut registry = ts::take_shared<GraduationRegistry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let treasury_cap = coin::create_treasury_cap_for_testing<TEST_TOKEN>(ctx);

            graduation::register_creator_token<TEST_TOKEN>(
                &mut registry,
                &market,
                treasury_cap,
                b"TTEST",
                b"Test Creator Token",
                ctx,
            );

            ts::return_shared(market);
            ts::return_shared(registry);
        };

        let liquidity_tokens = graduation::tokens_per_holder() * 2;
        let mut initialized_pool_id = @0x0;

        ts::next_tx(&mut scenario, @0x0);
        {
            let mut registry = ts::take_shared<GraduationRegistry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            graduation::set_admin(&mut registry, OPERATOR, ctx);
            assert_eq(graduation::get_admin(&registry), OPERATOR);
            ts::return_shared(registry);
        };

        // Operator initializes the AMM pool directly from the graduated market treasury.
        ts::next_tx(&mut scenario, OPERATOR);
        {
            let mut market = ts::take_shared<Market>(&scenario);
            let registry = ts::take_shared<GraduationRegistry>(&scenario);
            let mut vault = ts::take_shared<graduation::CreatorTokenVault<TEST_TOKEN>>(&scenario);
            let ctx = ts::ctx(&mut scenario);

            graduation::initialize_amm_pool<TEST_TOKEN>(
                &registry,
                &mut market,
                &mut vault,
                liquidity_tokens,
                100,
                ctx,
            );
            initialized_pool_id = graduation::get_vault_pool_id(&vault);
            assert_eq(graduation::has_prepared_initial_liquidity(&vault), true);
            assert_eq(graduation::has_seeded_initial_liquidity(&vault), true);
            assert!(initialized_pool_id != @0x0, 701);

            ts::return_shared(market);
            ts::return_shared(registry);
            ts::return_shared(vault);
        };

        ts::next_tx(&mut scenario, OPERATOR);
        {
            let pool = ts::take_shared<phase2_amm::CreatorTokenAmmPool<TEST_TOKEN>>(&scenario);
            assert_eq(phase2_amm::get_fee_bps(&pool), 100);
            assert!(phase2_amm::get_sui_reserve_mist(&pool) > 0, 702);
            assert!(phase2_amm::get_token_reserve(&pool) == liquidity_tokens, 703);
            assert!(phase2_amm::get_market_id(&pool) != @0x0, 704);
            ts::return_shared(pool);
        };

        ts::next_tx(&mut scenario, TRADER);
        {
            let mut pool = ts::take_shared<phase2_amm::CreatorTokenAmmPool<TEST_TOKEN>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let payment = coin::mint_for_testing<SUI>(100_000_000, ctx);
            let quoted = phase2_amm::quote_buy_tokens_out(&pool, 100_000_000);
            assert!(quoted > 0, 705);
            phase2_amm::buy_exact_sui_for_tokens(&mut pool, payment, 1, ctx);
            assert_eq(phase2_amm::get_total_swaps(&pool), 1);
            ts::return_shared(pool);
        };

        ts::next_tx(&mut scenario, TRADER);
        {
            let bought_tokens = ts::take_from_sender<Coin<TEST_TOKEN>>(&scenario);
            assert!(coin::value(&bought_tokens) > 0, 706);
            ts::return_to_sender(&scenario, bought_tokens);
        };

        ts::next_tx(&mut scenario, H2);
        {
            let mut pool = ts::take_shared<phase2_amm::CreatorTokenAmmPool<TEST_TOKEN>>(&scenario);
            let mut tokens = ts::take_from_sender<Coin<TEST_TOKEN>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let sell_amount = 100_000_000_000;
            let quoted = phase2_amm::quote_sell_sui_out(&pool, sell_amount);
            assert!(quoted > 0, 707);
            let sell_coin = coin::split(&mut tokens, sell_amount, ctx);
            phase2_amm::sell_exact_tokens_for_sui(&mut pool, sell_coin, 1, ctx);
            assert_eq(phase2_amm::get_total_swaps(&pool), 2);
            ts::return_to_sender(&scenario, tokens);
            ts::return_shared(pool);
        };

        ts::next_tx(&mut scenario, H2);
        {
            let proceeds = ts::take_from_sender<Coin<SUI>>(&scenario);
            assert!(coin::value(&proceeds) > 0, 708);
            ts::return_to_sender(&scenario, proceeds);
        };

        ts::end(scenario);
    }

    #[test]
    fun test_rollback_graduation_restores_market() {
        let mut scenario = ts::begin(CREATOR);
        setup_graduation(&mut scenario);
        setup_full_market(&mut scenario);

        // Graduate first
        ts::next_tx(&mut scenario, CREATOR);
        {
            let mut market = ts::take_shared<Market>(&scenario);
            let mut registry = ts::take_shared<GraduationRegistry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            graduation::graduate(&mut registry, &mut market, ctx);
            assert_eq(share_market::is_graduated(&market), true);
            assert_eq(graduation::get_total_graduated(&registry), 1);
            ts::return_shared(market);
            ts::return_shared(registry);
        };

        // Roll back — no payment needed since treasury was never drained.
        ts::next_tx(&mut scenario, CREATOR);
        {
            let mut market = ts::take_shared<Market>(&scenario);
            let mut registry = ts::take_shared<GraduationRegistry>(&scenario);
            let ctx = ts::ctx(&mut scenario);

            graduation::rollback_graduation(&mut registry, &mut market, ctx);

            assert_eq(share_market::is_graduated(&market), false);
            assert_eq(graduation::get_total_graduated(&registry), 0);

            ts::return_shared(market);
            ts::return_shared(registry);
        };

        // Market should be tradable again after rollback.
        ts::next_tx(&mut scenario, H2);
        {
            let mut market = ts::take_shared<Market>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            share_market::sell_share(&mut market, ctx);
            assert_eq(share_market::is_graduated(&market), false);
            ts::return_shared(market);
        };

        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = graduation::E_NOT_MARKET_OWNER)]
    fun test_non_owner_cannot_graduate() {
        let mut scenario = ts::begin(CREATOR);
        setup_graduation(&mut scenario);
        setup_full_market(&mut scenario);

        ts::next_tx(&mut scenario, H2);
        {
            let mut market = ts::take_shared<Market>(&scenario);
            let mut registry = ts::take_shared<GraduationRegistry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            graduation::graduate(&mut registry, &mut market, ctx);
            ts::return_shared(market);
            ts::return_shared(registry);
        };

        ts::end(scenario);
    }
}
