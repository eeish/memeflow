/// Post Attestation Module
/// Provides on-chain proof-of-existence for posts stored off-chain.
/// Posts are stored off-chain; this module only emits hash-based attestations.
module cord::cord_social {
    use sui::event;
    use sui::tx_context::{Self as tx};

    /// =============================
    /// Error Codes
    /// =============================
    const E_INVALID_HASH_LENGTH: u64 = 100;

    /// =============================
    /// Events
    /// =============================

    /// Emitted when a user publishes a post (hash-based attestation)
    ///
    /// Hash construction (for verification):
    ///   SHA256(author[32 bytes] || timestamp_ms[8 bytes BE] || content_bytes[*])
    ///
    /// - author: 32-byte Sui address
    /// - timestamp_ms: Unix timestamp in milliseconds (big-endian u64)
    /// - content_bytes: UTF-8 encoded post content
    ///
    /// The actual content is stored off-chain and can be deleted.
    /// This event provides immutable proof that the content existed at the given time.
    public struct PostCreated has copy, drop {
        author: address,
        content_hash: vector<u8>,  // 32-byte SHA256 hash
        timestamp_ms: u64,         // Unix timestamp in milliseconds
        post_id: vector<u8>,       // Off-chain post ID for lookup
    }

    /// =============================
    /// Post Attestation
    /// =============================

    /// Emit an on-chain attestation for a post stored off-chain.
    ///
    /// This creates an immutable record proving that content with the given hash
    /// existed at the specified timestamp. The actual content is stored off-chain.
    ///
    /// # Arguments
    /// * `content_hash` - 32-byte SHA256 hash of the content
    /// * `timestamp_ms` - Unix timestamp in milliseconds (used in hash computation)
    /// * `post_id` - Off-chain post ID for cross-referencing
    public entry fun emit_post(
        content_hash: vector<u8>,
        timestamp_ms: u64,
        post_id: vector<u8>,
        ctx: &mut TxContext,
    ) {
        let sender = tx::sender(ctx);

        // Validate hash is 32 bytes (SHA256)
        assert!(vector::length(&content_hash) == 32, E_INVALID_HASH_LENGTH);

        event::emit(PostCreated {
            author: sender,
            content_hash,
            timestamp_ms,
            post_id,
        });
    }
}
