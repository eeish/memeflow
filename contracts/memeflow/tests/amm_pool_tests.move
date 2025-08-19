/// Comprehensive tests for AMM pool functionality
#[test_only]
module memeflow::amm_pool_tests {
    use memeflow::amm_pool::{Self, Pool, LPToken, PoolCreationCap};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI; 
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::clock::{Self, Clock};
    use sui::test_utils;
    use std::string::{Self, String};

    // Test token for AMM pool testing
    public struct TEST_TOKEN has drop {}

    // Test addresses
    const ADMIN: address = @0xA001;
    const USER1: address = @0xB001;
    const USER2: address = @0xB002;
    const LIQUIDITY_PROVIDER: address = @0xC001;

    // Test constants
    const INITIAL_SUI: u64 = 10_000_000_000; // 10 SUI
    const INITIAL_TOKENS: u64 = 1_000_000_000_000; // 1000 tokens

    /// Test pool creation
    #[test]
    fun test_create_pool() {
        let scenario_val = ts::begin(ADMIN);
        let scenario = &mut scenario_val;

        // Create pool creation capability
        ts::next_tx(scenario, ADMIN);
        {
            let cap = amm_pool::create_pool_creation_cap(ts::ctx(scenario));
            transfer::public_transfer(cap, ADMIN);
        };

        // Create a new pool
        ts::next_tx(scenario, ADMIN);
        {
            let cap = ts::take_from_sender<PoolCreationCap>(scenario);
            let clock = clock::create_for_testing(ts::ctx(scenario));
            
            let sui_coin = coin::mint_for_testing<SUI>(INITIAL_SUI, ts::ctx(scenario));
            let token_coin = coin::mint_for_testing<TEST_TOKEN>(INITIAL_TOKENS, ts::ctx(scenario));
            
            let pool_id = amm_pool::create_pool<TEST_TOKEN>(
                &cap,
                string::utf8(b"TEST"),
                sui_coin,
                token_coin, 
                &clock,
                ts::ctx(scenario)
            );

            // Verify pool was created
            // Verify pool was created (pool_id is not zero ID)
            let zero_id = object::id_from_address(@0x0);
            assert!(pool_id != zero_id, 1);

            clock::destroy_for_testing(clock);
            ts::return_to_sender(scenario, cap);
        };

        // Check pool state
        ts::next_tx(scenario, ADMIN);
        {
            let pool = ts::take_shared<Pool<TEST_TOKEN>>(scenario);
            let (sui_reserve, token_reserve) = amm_pool::get_reserves(&pool);
            let (lp_supply, _, _, is_active) = amm_pool::get_pool_stats(&pool);
            
            assert!(sui_reserve == INITIAL_SUI, 2);
            assert!(token_reserve == INITIAL_TOKENS, 3);
            assert!(lp_supply > 0, 4);
            assert!(is_active == true, 5);

            ts::return_shared(pool);
        };

        ts::end(scenario_val);
    }

    /// Test swapping SUI for tokens
    #[test]
    fun test_swap_sui_for_tokens() {
        let scenario_val = ts::begin(ADMIN);
        let scenario = &mut scenario_val;

        // Setup pool
        setup_test_pool(scenario, ADMIN);

        // Perform swap
        ts::next_tx(scenario, USER1);
        {
            let pool = ts::take_shared<Pool<TEST_TOKEN>>(scenario);
            let clock = clock::create_for_testing(ts::ctx(scenario));
            
            let sui_in = 1_000_000_000; // 1 SUI
            let payment = coin::mint_for_testing<SUI>(sui_in, ts::ctx(scenario));
            
            let (sui_reserve_before, token_reserve_before) = amm_pool::get_reserves(&pool);
            
            amm_pool::swap_sui_for_tokens<TEST_TOKEN>(
                &mut pool,
                payment,
                0, // min_tokens_out
                &clock,
                ts::ctx(scenario)
            );

            // Check reserves changed
            let (sui_reserve_after, token_reserve_after) = amm_pool::get_reserves(&pool);
            
            assert!(sui_reserve_after > sui_reserve_before, 6);
            assert!(token_reserve_after < token_reserve_before, 7);

            clock::destroy_for_testing(clock);
            ts::return_shared(pool);
        };

        ts::end(scenario_val);
    }

    /// Test swapping tokens for SUI
    #[test]
    fun test_swap_tokens_for_sui() {
        let scenario_val = ts::begin(ADMIN);
        let scenario = &mut scenario_val;

        // Setup pool
        setup_test_pool(scenario, ADMIN);

        // Perform swap
        ts::next_tx(scenario, USER1);
        {
            let pool = ts::take_shared<Pool<TEST_TOKEN>>(scenario);
            let clock = clock::create_for_testing(ts::ctx(scenario));
            
            let token_amount = 100_000_000; // 100 tokens
            let token_coin = coin::mint_for_testing<TEST_TOKEN>(token_amount, ts::ctx(scenario));
            
            let (sui_reserve_before, token_reserve_before) = amm_pool::get_reserves(&pool);
            
            amm_pool::swap_tokens_for_sui<TEST_TOKEN>(
                &mut pool,
                token_coin,
                0, // min_sui_out
                &clock,
                ts::ctx(scenario)
            );

            // Check reserves changed
            let (sui_reserve_after, token_reserve_after) = amm_pool::get_reserves(&pool);
            
            assert!(sui_reserve_after < sui_reserve_before, 8);
            assert!(token_reserve_after > token_reserve_before, 9);

            clock::destroy_for_testing(clock);
            ts::return_shared(pool);
        };

        ts::end(scenario_val);
    }

    /// Test adding liquidity
    #[test]
    fun test_add_liquidity() {
        let scenario_val = ts::begin(ADMIN);
        let scenario = &mut scenario_val;

        // Setup pool
        setup_test_pool(scenario, ADMIN);

        // Add liquidity
        ts::next_tx(scenario, LIQUIDITY_PROVIDER);
        {
            let pool = ts::take_shared<Pool<TEST_TOKEN>>(scenario);
            let clock = clock::create_for_testing(ts::ctx(scenario));
            
            let sui_amount = 5_000_000_000; // 5 SUI
            let token_amount = 500_000_000_000; // 500 tokens
            
            let sui_coin = coin::mint_for_testing<SUI>(sui_amount, ts::ctx(scenario));
            let token_coin = coin::mint_for_testing<TEST_TOKEN>(token_amount, ts::ctx(scenario));
            
            let (sui_reserve_before, token_reserve_before) = amm_pool::get_reserves(&pool);
            let (lp_supply_before, _, _, _) = amm_pool::get_pool_stats(&pool);
            
            amm_pool::add_liquidity<TEST_TOKEN>(
                &mut pool,
                sui_coin,
                token_coin,
                0, // min_lp_tokens
                &clock,
                ts::ctx(scenario)
            );

            // Check reserves and LP supply increased
            let (sui_reserve_after, token_reserve_after) = amm_pool::get_reserves(&pool);
            let (lp_supply_after, _, _, _) = amm_pool::get_pool_stats(&pool);
            
            assert!(sui_reserve_after > sui_reserve_before, 10);
            assert!(token_reserve_after > token_reserve_before, 11);
            assert!(lp_supply_after > lp_supply_before, 12);

            clock::destroy_for_testing(clock);
            ts::return_shared(pool);
        };

        // Check LP token was minted
        ts::next_tx(scenario, LIQUIDITY_PROVIDER);
        {
            assert!(ts::has_most_recent_for_sender<LPToken<TEST_TOKEN>>(scenario), 13);
        };

        ts::end(scenario_val);
    }

    /// Test removing liquidity
    #[test]
    fun test_remove_liquidity() {
        let scenario_val = ts::begin(ADMIN);
        let scenario = &mut scenario_val;

        // Setup pool and add liquidity first
        setup_test_pool_with_liquidity(scenario, ADMIN, LIQUIDITY_PROVIDER);

        // Remove liquidity
        ts::next_tx(scenario, LIQUIDITY_PROVIDER);
        {
            let pool = ts::take_shared<Pool<TEST_TOKEN>>(scenario);
            let clock = clock::create_for_testing(ts::ctx(scenario));
            let lp_token = ts::take_from_sender<LPToken<TEST_TOKEN>>(scenario);
            
            let (sui_reserve_before, token_reserve_before) = amm_pool::get_reserves(&pool);
            let (lp_supply_before, _, _, _) = amm_pool::get_pool_stats(&pool);
            
            amm_pool::remove_liquidity<TEST_TOKEN>(
                &mut pool,
                lp_token,
                0, // min_sui_out
                0, // min_tokens_out
                &clock,
                ts::ctx(scenario)
            );

            // Check reserves and LP supply decreased
            let (sui_reserve_after, token_reserve_after) = amm_pool::get_reserves(&pool);
            let (lp_supply_after, _, _, _) = amm_pool::get_pool_stats(&pool);
            
            assert!(sui_reserve_after < sui_reserve_before, 14);
            assert!(token_reserve_after < token_reserve_before, 15);
            assert!(lp_supply_after < lp_supply_before, 16);

            clock::destroy_for_testing(clock);
            ts::return_shared(pool);
        };

        ts::end(scenario_val);
    }

    /// Test price calculation
    #[test]
    fun test_price_calculation() {
        let scenario_val = ts::begin(ADMIN);
        let scenario = &mut scenario_val;

        // Setup pool
        setup_test_pool(scenario, ADMIN);

        // Check initial price
        ts::next_tx(scenario, USER1);
        {
            let pool = ts::take_shared<Pool<TEST_TOKEN>>(scenario);
            let initial_price = amm_pool::get_token_price(&pool);
            
            // Price should be SUI_RESERVE / TOKEN_RESERVE
            let expected_price = (INITIAL_SUI * 1_000_000_000) / INITIAL_TOKENS;
            assert!(initial_price == expected_price, 17);

            ts::return_shared(pool);
        };

        ts::end(scenario_val);
    }

    /// Test amount calculation functions
    #[test]
    fun test_amount_calculations() {
        let scenario_val = ts::begin(ADMIN);
        let scenario = &mut scenario_val;

        // Test get_amount_out function
        let amount_in = 1_000_000_000; // 1 SUI
        let reserve_in = 10_000_000_000; // 10 SUI
        let reserve_out = 1_000_000_000_000; // 1000 tokens
        
        let amount_out = amm_pool::get_amount_out(amount_in, reserve_in, reserve_out);
        
        // Amount out should be less than proportional due to fees and slippage
        let proportional = (amount_in * reserve_out) / reserve_in;
        assert!(amount_out < proportional, 18);
        assert!(amount_out > 0, 19);

        ts::end(scenario_val);
    }

    /// Test pool deactivation/reactivation
    #[test]
    fun test_pool_activation() {
        let scenario_val = ts::begin(ADMIN);
        let scenario = &mut scenario_val;

        // Setup pool
        setup_test_pool(scenario, ADMIN);

        // Deactivate pool
        ts::next_tx(scenario, ADMIN);
        {
            let pool = ts::take_shared<Pool<TEST_TOKEN>>(scenario);
            
            amm_pool::deactivate_pool<TEST_TOKEN>(&mut pool, ts::ctx(scenario));
            
            let (_, _, _, is_active) = amm_pool::get_pool_stats(&pool);
            assert!(is_active == false, 20);

            ts::return_shared(pool);
        };

        // Reactivate pool
        ts::next_tx(scenario, ADMIN);
        {
            let pool = ts::take_shared<Pool<TEST_TOKEN>>(scenario);
            
            amm_pool::reactivate_pool<TEST_TOKEN>(&mut pool, ts::ctx(scenario));
            
            let (_, _, _, is_active) = amm_pool::get_pool_stats(&pool);
            assert!(is_active == true, 21);

            ts::return_shared(pool);
        };

        ts::end(scenario_val);
    }

    /// Test swapping fails when pool is inactive
    #[test]
    #[expected_failure(abort_code = amm_pool::EPoolNotActive)]
    fun test_swap_fails_when_inactive() {
        let scenario_val = ts::begin(ADMIN);
        let scenario = &mut scenario_val;

        // Setup pool and deactivate it
        setup_test_pool(scenario, ADMIN);

        ts::next_tx(scenario, ADMIN);
        {
            let pool = ts::take_shared<Pool<TEST_TOKEN>>(scenario);
            amm_pool::deactivate_pool<TEST_TOKEN>(&mut pool, ts::ctx(scenario));
            ts::return_shared(pool);
        };

        // Try to swap - should fail
        ts::next_tx(scenario, USER1);
        {
            let pool = ts::take_shared<Pool<TEST_TOKEN>>(scenario);
            let clock = clock::create_for_testing(ts::ctx(scenario));
            let payment = coin::mint_for_testing<SUI>(1_000_000_000, ts::ctx(scenario));
            
            amm_pool::swap_sui_for_tokens<TEST_TOKEN>(
                &mut pool,
                payment,
                0,
                &clock,
                ts::ctx(scenario)
            );

            clock::destroy_for_testing(clock);
            ts::return_shared(pool);
        };

        ts::end(scenario_val);
    }

    // Helper functions

    fun setup_test_pool(scenario: &mut Scenario, admin: address) {
        ts::next_tx(scenario, admin);
        {
            let cap = amm_pool::create_pool_creation_cap(ts::ctx(scenario));
            transfer::public_transfer(cap, admin);
        };

        ts::next_tx(scenario, admin);
        {
            let cap = ts::take_from_sender<PoolCreationCap>(scenario);
            let clock = clock::create_for_testing(ts::ctx(scenario));
            
            let sui_coin = coin::mint_for_testing<SUI>(INITIAL_SUI, ts::ctx(scenario));
            let token_coin = coin::mint_for_testing<TEST_TOKEN>(INITIAL_TOKENS, ts::ctx(scenario));
            
            amm_pool::create_pool<TEST_TOKEN>(
                &cap,
                string::utf8(b"TEST"),
                sui_coin,
                token_coin,
                &clock,
                ts::ctx(scenario)
            );

            clock::destroy_for_testing(clock);
            ts::return_to_sender(scenario, cap);
        };
    }

    fun setup_test_pool_with_liquidity(scenario: &mut Scenario, admin: address, lp: address) {
        setup_test_pool(scenario, admin);

        // Add initial liquidity
        ts::next_tx(scenario, lp);
        {
            let pool = ts::take_shared<Pool<TEST_TOKEN>>(scenario);
            let clock = clock::create_for_testing(ts::ctx(scenario));
            
            let sui_coin = coin::mint_for_testing<SUI>(5_000_000_000, ts::ctx(scenario));
            let token_coin = coin::mint_for_testing<TEST_TOKEN>(500_000_000_000, ts::ctx(scenario));
            
            amm_pool::add_liquidity<TEST_TOKEN>(
                &mut pool,
                sui_coin,
                token_coin,
                0,
                &clock,
                ts::ctx(scenario)
            );

            clock::destroy_for_testing(clock);
            ts::return_shared(pool);
        };
    }
}