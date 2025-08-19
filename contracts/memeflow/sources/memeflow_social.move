/// MemeFlow Social Integration Module
/// This module provides integration between MemeFlow tokens and social following mechanics
module memeflow::memeflow_social {
    use std::option;
    use sui::coin::{Self, Coin};
    use sui::event;
    use sui::object;
    use sui::table::{Self, Table};
    use sui::tx_context::{Self as tx};
    use sui::sui::SUI;
    
    use memeflow::social_follow::{Self, FollowBook, Market};

    /// =============================
    /// Events
    /// =============================
    
    /// Emitted when a user follows a token creator
    public struct TokenCreatorFollowed has copy, drop {
        follower: address,
        creator: address,
        token_symbol: vector<u8>,
        price_paid: u64,
    }
    
    /// Emitted when a user unfollows a token creator
    public struct TokenCreatorUnfollowed has copy, drop {
        follower: address,
        creator: address,
        token_symbol: vector<u8>,
        refund: u64,
    }
    
    /// Emitted when social profile is linked to token
    public struct SocialProfileLinked has copy, drop {
        owner: address,
        token_id: address,
        token_symbol: vector<u8>,
    }

    /// =============================
    /// Structures
    /// =============================
    
    /// Extended profile that links social following with token creation
    public struct MemeFlowProfile has key {
        id: object::UID,
        owner: address,
        /// Link to user's follow book
        follow_book_id: address,
        /// Link to user's market
        market_id: address,
        /// Associated meme token address (if created)
        token_address: Option<address>,
        /// Associated meme token symbol
        token_symbol: vector<u8>,
        /// Total followers (cached for display)
        follower_count: u64,
        /// Total following (cached for display)
        following_count: u64,
        /// Profile metadata
        username: vector<u8>,
        bio: vector<u8>,
        avatar_url: vector<u8>,
        /// Stats
        total_volume_traded: u64,
        total_fees_earned: u64,
    }
    
    /// Registry to track all profiles
    public struct ProfileRegistry has key {
        id: object::UID,
        profiles: Table<address, address>, // owner -> profile_id
        total_profiles: u64,
    }

    /// =============================
    /// Init Function
    /// =============================
    
    fun init(ctx: &mut TxContext) {
        let registry = ProfileRegistry {
            id: object::new(ctx),
            profiles: table::new(ctx),
            total_profiles: 0,
        };
        transfer::share_object(registry);
    }

    /// =============================
    /// Profile Management
    /// =============================
    
    /// Create a complete MemeFlow profile with social features
    public entry fun create_memeflow_profile(
        username: vector<u8>,
        bio: vector<u8>,
        avatar_url: vector<u8>,
        registry: &mut ProfileRegistry,
        ctx: &mut TxContext,
    ) {
        let sender = tx::sender(ctx);
        
        // Create underlying social components
        social_follow::create_profile(ctx);
        
        // Create MemeFlow profile
        let profile = MemeFlowProfile {
            id: object::new(ctx),
            owner: sender,
            follow_book_id: sender, // Will be updated when linked
            market_id: sender, // Will be updated when linked
            token_address: option::none(),
            token_symbol: vector::empty(),
            follower_count: 0,
            following_count: 0,
            username,
            bio,
            avatar_url,
            total_volume_traded: 0,
            total_fees_earned: 0,
        };
        
        let profile_id = object::uid_to_address(&profile.id);
        table::add(&mut registry.profiles, sender, profile_id);
        registry.total_profiles = registry.total_profiles + 1;
        
        transfer::transfer(profile, sender);
    }
    
    /// Link an existing token to the profile
    public entry fun link_token_to_profile(
        profile: &mut MemeFlowProfile,
        token_address: address,
        token_symbol: vector<u8>,
        ctx: &mut TxContext,
    ) {
        let sender = tx::sender(ctx);
        assert!(sender == profile.owner, 1); // E_NOT_OWNER
        assert!(option::is_none(&profile.token_address), 2); // E_TOKEN_ALREADY_LINKED
        
        option::fill(&mut profile.token_address, token_address);
        profile.token_symbol = token_symbol;
        
        event::emit(SocialProfileLinked {
            owner: sender,
            token_id: token_address,
            token_symbol,
        });
    }

    /// =============================
    /// Enhanced Follow Functions
    /// =============================
    
    /// Follow a token creator with integrated tracking
    public entry fun follow_token_creator(
        follower_book: &mut FollowBook,
        creator_market: &mut Market,
        follower_profile: &mut MemeFlowProfile,
        creator_profile: &mut MemeFlowProfile,
        payment: Coin<SUI>,
        ctx: &mut TxContext,
    ) {
        let follower = tx::sender(ctx);
        assert!(follower == follower_profile.owner, 1); // E_NOT_OWNER
        
        let price = coin::value(&payment);
        
        // Execute the follow using social_follow module
        social_follow::buy_key(follower_book, creator_market, payment, ctx);
        
        // Update profile stats
        follower_profile.following_count = follower_profile.following_count + 1;
        creator_profile.follower_count = creator_profile.follower_count + 1;
        creator_profile.total_volume_traded = creator_profile.total_volume_traded + price;
        
        // Emit enhanced event
        if (!vector::is_empty(&creator_profile.token_symbol)) {
            event::emit(TokenCreatorFollowed {
                follower,
                creator: creator_profile.owner,
                token_symbol: creator_profile.token_symbol,
                price_paid: price,
            });
        }
    }
    
    /// Sponsored follow for new users (first 7 follows are free)
    public entry fun sponsored_follow_creator(
        follower_book: &mut FollowBook,
        creator_market: &mut Market,
        follower_profile: &mut MemeFlowProfile,
        creator_profile: &mut MemeFlowProfile,
        ctx: &mut TxContext,
    ) {
        let follower = tx::sender(ctx);
        assert!(follower == follower_profile.owner, 1); // E_NOT_OWNER
        
        // Execute sponsored follow
        social_follow::sponsored_buy_key(follower_book, creator_market, ctx);
        
        // Update profile stats
        follower_profile.following_count = follower_profile.following_count + 1;
        creator_profile.follower_count = creator_profile.follower_count + 1;
        
        // Emit event
        if (!vector::is_empty(&creator_profile.token_symbol)) {
            event::emit(TokenCreatorFollowed {
                follower,
                creator: creator_profile.owner,
                token_symbol: creator_profile.token_symbol,
                price_paid: 0, // Sponsored = free
            });
        }
    }
    
    /// Unfollow a token creator with integrated tracking
    public entry fun unfollow_token_creator(
        follower_book: &mut FollowBook,
        creator_market: &mut Market,
        follower_profile: &mut MemeFlowProfile,
        creator_profile: &mut MemeFlowProfile,
        ctx: &mut TxContext,
    ) {
        let follower = tx::sender(ctx);
        assert!(follower == follower_profile.owner, 1); // E_NOT_OWNER
        
        // Get refund amount before unfollowing
        let refund = social_follow::current_sell_refund_mist(
            social_follow::get_market_supply(creator_market)
        );
        
        // Execute the unfollow
        social_follow::sell_key(follower_book, creator_market, ctx);
        
        // Update profile stats
        follower_profile.following_count = follower_profile.following_count - 1;
        creator_profile.follower_count = creator_profile.follower_count - 1;
        
        // Emit enhanced event
        if (!vector::is_empty(&creator_profile.token_symbol)) {
            event::emit(TokenCreatorUnfollowed {
                follower,
                creator: creator_profile.owner,
                token_symbol: creator_profile.token_symbol,
                refund,
            });
        }
    }

    // =============================
    // Batch Operations (Disabled)
    // =============================
    // Batch operations are currently disabled due to Move 2024 limitations
    // Move doesn't support vectors of mutable references
    // TODO: Redesign batch operations using a different approach

    /// =============================
    /// View Functions
    /// =============================
    
    /// Get profile information
    public fun get_profile_stats(profile: &MemeFlowProfile): (u64, u64, u64, u64) {
        (
            profile.follower_count,
            profile.following_count,
            profile.total_volume_traded,
            profile.total_fees_earned
        )
    }
    
    /// Check if profile has associated token
    public fun has_token(profile: &MemeFlowProfile): bool {
        option::is_some(&profile.token_address)
    }
    
    /// Get username
    public fun get_username(profile: &MemeFlowProfile): vector<u8> {
        profile.username
    }
    
    /// Get bio
    public fun get_bio(profile: &MemeFlowProfile): vector<u8> {
        profile.bio
    }
    
    /// Get avatar URL
    public fun get_avatar_url(profile: &MemeFlowProfile): vector<u8> {
        profile.avatar_url
    }

    /// =============================
    /// Admin Functions
    /// =============================
    
    /// Update profile metadata
    public entry fun update_profile_metadata(
        profile: &mut MemeFlowProfile,
        new_username: vector<u8>,
        new_bio: vector<u8>,
        new_avatar_url: vector<u8>,
        ctx: &mut TxContext,
    ) {
        let sender = tx::sender(ctx);
        assert!(sender == profile.owner, 1); // E_NOT_OWNER
        
        profile.username = new_username;
        profile.bio = new_bio;
        profile.avatar_url = new_avatar_url;
    }
}