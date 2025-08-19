/// Comprehensive tests for MemeFlow token factory
#[test_only]
module memeflow::meme_token_factory_tests {
    use memeflow::meme_token_factory::{Self, MemeTokenFactory, TokenCreated};
    use memeflow::deploy_utils;
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::clock::{Self, Clock};
    use sui::test_utils;
    use std::string::{Self, String};

    // Test addresses
    const ADMIN: address = @0xA001;
    const USER1: address = @0xB001; 
    const USER2: address = @0xB002;

    // Test constants
    const CREATION_FEE: u64 = 1_000_000_000; // 1 SUI
    const INITIAL_SUPPLY: u64 = 1_000_000_000_000_000_000; // 1 billion tokens

    /// Test factory initialization
    #[test]
    fun test_factory_initialization() {
        let scenario_val = ts::begin(ADMIN);
        let scenario = &mut scenario_val;

        // Initialize the system
        ts::next_tx(scenario, ADMIN);
        {
            deploy_utils::initialize_memeflow(ts::ctx(scenario));
        };

        // Check that factory was created and shared
        ts::next_tx(scenario, ADMIN);
        {
            let factory = ts::take_shared<MemeTokenFactory>(scenario);
            let (total_tokens, _fees) = meme_token_factory::get_factory_stats(&factory);
            
            assert!(total_tokens == 0, 1);
            ts::return_shared(factory);
        };

        ts::end(scenario_val);
    }

    /// Test token creation with valid parameters
    #[test] 
    fun test_create_token_success() {
        let scenario_val = ts::begin(ADMIN);
        let scenario = &mut scenario_val;

        // Setup
        ts::next_tx(scenario, ADMIN);
        {
            deploy_utils::initialize_memeflow(ts::ctx(scenario));
        };

        // Create a test token
        ts::next_tx(scenario, USER1);
        {
            let factory = ts::take_shared<MemeTokenFactory>(scenario);
            let clock = clock::create_for_testing(ts::ctx(scenario));
            
            // Create payment coin
            let payment = coin::mint_for_testing<SUI>(CREATION_FEE, ts::ctx(scenario));
            
            meme_token_factory::create_meme_token(
                &mut factory,
                payment,
                b"DOGE",
                b"DogeCoin",
                b"Much wow, very token",
                b"https://example.com/doge.png",
                &clock,
                ts::ctx(scenario)
            );

            // Verify token was created
            let (total_tokens, fees_collected) = meme_token_factory::get_factory_stats(&factory);
            assert!(total_tokens == 1, 2);
            assert!(fees_collected == CREATION_FEE, 3);

            // Verify token info
            let symbol = string::utf8(b"DOGE");
            let (token_symbol, name, description, image_url, creator, 
                 total_supply, circulating_supply, bonding_progress, trading_enabled) = 
                meme_token_factory::get_token_info(&factory, symbol);
            
            assert!(token_symbol == symbol, 4);
            assert!(name == string::utf8(b"DogeCoin"), 5);
            assert!(creator == USER1, 6);
            assert!(total_supply == INITIAL_SUPPLY, 7);
            assert!(circulating_supply == 0, 8);
            assert!(bonding_progress == 0, 9);
            assert!(trading_enabled == true, 10);

            clock::destroy_for_testing(clock);
            ts::return_shared(factory);
        };

        ts::end(scenario_val);
    }

    /// Test token creation with duplicate symbol fails
    #[test]
    #[expected_failure(abort_code = meme_token_factory::ETokenExists)]
    fun test_create_duplicate_token_fails() {
        let scenario_val = ts::begin(ADMIN);
        let scenario = &mut scenario_val;

        // Setup
        ts::next_tx(scenario, ADMIN);
        {
            deploy_utils::initialize_memeflow(ts::ctx(scenario));
        };

        // Create first token
        ts::next_tx(scenario, USER1);
        {
            let factory = ts::take_shared<MemeTokenFactory>(scenario);
            let clock = clock::create_for_testing(ts::ctx(scenario));
            let payment = coin::mint_for_testing<SUI>(CREATION_FEE, ts::ctx(scenario));
            
            meme_token_factory::create_meme_token(
                &mut factory,
                payment,
                b"DOGE",
                b"DogeCoin", 
                b"Much wow, very token",
                b"https://example.com/doge.png",
                &clock,
                ts::ctx(scenario)
            );

            clock::destroy_for_testing(clock);
            ts::return_shared(factory);
        };

        // Try to create duplicate token - should fail
        ts::next_tx(scenario, USER2);
        {
            let factory = ts::take_shared<MemeTokenFactory>(scenario);
            let clock = clock::create_for_testing(ts::ctx(scenario));
            let payment = coin::mint_for_testing<SUI>(CREATION_FEE, ts::ctx(scenario));
            
            meme_token_factory::create_meme_token(
                &mut factory,
                payment,
                b"DOGE", // Same symbol
                b"Another Doge",
                b"Another doge token",
                b"https://example.com/anotherdoge.png",
                &clock,
                ts::ctx(scenario)
            );

            clock::destroy_for_testing(clock);
            ts::return_shared(factory);
        };

        ts::end(scenario_val);
    }

    /// Test token creation with insufficient payment fails
    #[test]
    #[expected_failure(abort_code = meme_token_factory::EInsufficientPayment)]
    fun test_create_token_insufficient_payment() {
        let scenario_val = ts::begin(ADMIN);
        let scenario = &mut scenario_val;

        // Setup
        ts::next_tx(scenario, ADMIN);
        {
            deploy_utils::initialize_memeflow(ts::ctx(scenario));
        };

        // Try to create token with insufficient payment
        ts::next_tx(scenario, USER1);
        {
            let factory = ts::take_shared<MemeTokenFactory>(scenario);
            let clock = clock::create_for_testing(ts::ctx(scenario));
            
            // Pay less than required fee
            let payment = coin::mint_for_testing<SUI>(CREATION_FEE - 1, ts::ctx(scenario));
            
            meme_token_factory::create_meme_token(
                &mut factory,
                payment,
                b"DOGE",
                b"DogeCoin",
                b"Much wow, very token", 
                b"https://example.com/doge.png",
                &clock,
                ts::ctx(scenario)
            );

            clock::destroy_for_testing(clock);
            ts::return_shared(factory);
        };

        ts::end(scenario_val);
    }

    /// Test buying tokens from bonding curve
    #[test]
    fun test_buy_tokens() {
        let scenario_val = ts::begin(ADMIN);
        let scenario = &mut scenario_val;

        // Setup and create token
        setup_token_for_trading(scenario, ADMIN, USER1);

        // Buy tokens
        ts::next_tx(scenario, USER2);
        {
            let factory = ts::take_shared<MemeTokenFactory>(scenario);
            let clock = clock::create_for_testing(ts::ctx(scenario));
            
            let sui_amount = 5_000_000_000; // 5 SUI
            let payment = coin::mint_for_testing<SUI>(sui_amount, ts::ctx(scenario));
            
            meme_token_factory::buy_tokens(
                &mut factory,
                b"DOGE",
                payment,
                0, // min_tokens_out
                &clock,
                ts::ctx(scenario)
            );

            // Verify token info changed
            let symbol = string::utf8(b"DOGE");
            let (_, _, _, _, _, _, circulating_supply, bonding_progress, _) = 
                meme_token_factory::get_token_info(&factory, symbol);
            
            assert!(circulating_supply > 0, 11);
            assert!(bonding_progress > 0, 12);

            clock::destroy_for_testing(clock);
            ts::return_shared(factory);
        };

        ts::end(scenario_val);
    }

    /// Test selling tokens back to bonding curve
    #[test] 
    fun test_sell_tokens() {
        let scenario_val = ts::begin(ADMIN);
        let scenario = &mut scenario_val;

        // Setup and create token
        setup_token_for_trading(scenario, ADMIN, USER1);

        // Buy tokens first
        ts::next_tx(scenario, USER2);
        {
            let factory = ts::take_shared<MemeTokenFactory>(scenario);
            let clock = clock::create_for_testing(ts::ctx(scenario));
            let payment = coin::mint_for_testing<SUI>(5_000_000_000, ts::ctx(scenario));
            
            meme_token_factory::buy_tokens(
                &mut factory,
                b"DOGE",
                payment,
                0,
                &clock,
                ts::ctx(scenario)
            );

            clock::destroy_for_testing(clock);
            ts::return_shared(factory);
        };

        // Now sell some tokens back
        ts::next_tx(scenario, USER2);
        {
            let factory = ts::take_shared<MemeTokenFactory>(scenario);
            let clock = clock::create_for_testing(ts::ctx(scenario));
            
            let token_amount = 1_000_000_000; // 1 token
            
            meme_token_factory::sell_tokens(
                &mut factory,
                b"DOGE",
                token_amount,
                0, // min_sui_out
                &clock,
                ts::ctx(scenario)
            );

            clock::destroy_for_testing(clock);
            ts::return_shared(factory);
        };

        ts::end(scenario_val);
    }

    /// Test price calculation
    #[test]
    fun test_token_price() {
        let scenario_val = ts::begin(ADMIN);
        let scenario = &mut scenario_val;

        // Setup and create token
        setup_token_for_trading(scenario, ADMIN, USER1);

        // Check initial price
        ts::next_tx(scenario, USER1);
        {
            let factory = ts::take_shared<MemeTokenFactory>(scenario);
            let symbol = string::utf8(b"DOGE");
            let initial_price = meme_token_factory::get_token_price(&factory, symbol);
            
            // Initial price should be very low (no SUI in curve yet)
            assert!(initial_price == 0, 13);
            
            ts::return_shared(factory);
        };

        // Buy tokens to increase price
        ts::next_tx(scenario, USER2);
        {
            let factory = ts::take_shared<MemeTokenFactory>(scenario);
            let clock = clock::create_for_testing(ts::ctx(scenario));
            let payment = coin::mint_for_testing<SUI>(10_000_000_000, ts::ctx(scenario)); // 10 SUI
            
            meme_token_factory::buy_tokens(
                &mut factory,
                b"DOGE",
                payment,
                0,
                &clock,
                ts::ctx(scenario)
            );

            // Check price increased
            let symbol = string::utf8(b"DOGE");
            let new_price = meme_token_factory::get_token_price(&factory, symbol);
            assert!(new_price > 0, 14);

            clock::destroy_for_testing(clock);
            ts::return_shared(factory);
        };

        ts::end(scenario_val);
    }

    /// Test admin functions
    #[test]
    fun test_admin_functions() {
        let scenario_val = ts::begin(ADMIN);
        let scenario = &mut scenario_val;

        // Setup
        ts::next_tx(scenario, ADMIN);
        {
            deploy_utils::initialize_memeflow(ts::ctx(scenario));
        };

        // Test updating creation fee
        ts::next_tx(scenario, ADMIN);
        {
            let factory = ts::take_shared<MemeTokenFactory>(scenario);
            let new_fee = 2_000_000_000; // 2 SUI
            
            meme_token_factory::update_creation_fee(
                &mut factory,
                new_fee,
                ts::ctx(scenario)
            );

            ts::return_shared(factory);
        };

        // Test withdrawing fees (after some tokens are created)
        setup_token_for_trading(scenario, ADMIN, USER1);

        ts::next_tx(scenario, ADMIN);
        {
            let factory = ts::take_shared<MemeTokenFactory>(scenario);
            let (_, fees_before) = meme_token_factory::get_factory_stats(&factory);
            
            if (fees_before > 0) {
                meme_token_factory::withdraw_fees(
                    &mut factory,
                    fees_before / 2, // Withdraw half
                    ts::ctx(scenario)
                );
            };

            ts::return_shared(factory);
        };

        ts::end(scenario_val);
    }

    // Helper function to setup a token for trading tests
    fun setup_token_for_trading(scenario: &mut Scenario, admin: address, user: address) {
        ts::next_tx(scenario, admin);
        {
            deploy_utils::initialize_memeflow(ts::ctx(scenario));
        };

        ts::next_tx(scenario, user);
        {
            let factory = ts::take_shared<MemeTokenFactory>(scenario);
            let clock = clock::create_for_testing(ts::ctx(scenario));
            let payment = coin::mint_for_testing<SUI>(CREATION_FEE, ts::ctx(scenario));
            
            meme_token_factory::create_meme_token(
                &mut factory,
                payment,
                b"DOGE",
                b"DogeCoin",
                b"Much wow, very token",
                b"https://example.com/doge.png",
                &clock,
                ts::ctx(scenario)
            );

            clock::destroy_for_testing(clock);
            ts::return_shared(factory);
        };
    }
}