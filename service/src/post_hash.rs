//! Post Content Hash Module
//!
//! Implements the hash construction for on-chain post attestation.
//!
//! # Hash Structure
//!
//! ```text
//! SHA256(author[32 bytes] || timestamp_ms[8 bytes BE] || content[*])
//! ```
//!
//! - `author`: 32-byte Sui address (hex-decoded, without 0x prefix)
//! - `timestamp_ms`: Unix timestamp in milliseconds (big-endian u64)
//! - `content`: UTF-8 encoded post content (variable length)
//!
//! # Why This Structure?
//!
//! 1. **Collision-resistant**: Fixed-width fields for author and timestamp
//!    eliminate ambiguity (no delimiters needed)
//! 2. **Minimal fields**: Only includes data needed for attestation
//! 3. **Easy verification**: Can be computed in Move, Rust, TypeScript, etc.
//! 4. **Deterministic**: Same inputs always produce same hash

use sha2::{Digest, Sha256};

/// Compute the content hash for on-chain attestation.
///
/// # Arguments
/// * `author` - Sui address (with or without 0x prefix)
/// * `timestamp_ms` - Unix timestamp in milliseconds
/// * `content` - UTF-8 post content
///
/// # Returns
/// 32-byte SHA256 hash as a hex string (without 0x prefix)
pub fn compute_content_hash(author: &str, timestamp_ms: u64, content: &str) -> Result<String, HashError> {
    let hash_bytes = compute_content_hash_bytes(author, timestamp_ms, content)?;
    Ok(hex::encode(hash_bytes))
}

/// Compute the content hash as raw bytes.
pub fn compute_content_hash_bytes(author: &str, timestamp_ms: u64, content: &str) -> Result<[u8; 32], HashError> {
    // Parse and validate author address
    let author_bytes = parse_sui_address(author)?;

    // Build the preimage: author[32] || timestamp[8 BE] || content[*]
    let mut hasher = Sha256::new();
    hasher.update(&author_bytes);
    hasher.update(&timestamp_ms.to_be_bytes());
    hasher.update(content.as_bytes());

    let result = hasher.finalize();
    Ok(result.into())
}

/// Verify that a hash matches the given inputs.
pub fn verify_content_hash(
    hash: &str,
    author: &str,
    timestamp_ms: u64,
    content: &str,
) -> Result<bool, HashError> {
    let expected = compute_content_hash(author, timestamp_ms, content)?;
    Ok(constant_time_eq(hash, &expected))
}

/// Parse a Sui address string into 32 bytes.
fn parse_sui_address(address: &str) -> Result<[u8; 32], HashError> {
    // Remove 0x prefix if present
    let hex_str = address.strip_prefix("0x").unwrap_or(address);

    // Validate length (64 hex chars = 32 bytes)
    if hex_str.len() != 64 {
        return Err(HashError::InvalidAddress(format!(
            "Address must be 64 hex characters, got {}",
            hex_str.len()
        )));
    }

    // Decode hex
    let bytes = hex::decode(hex_str)
        .map_err(|e| HashError::InvalidAddress(format!("Invalid hex: {}", e)))?;

    // Convert to fixed-size array
    let mut result = [0u8; 32];
    result.copy_from_slice(&bytes);
    Ok(result)
}

/// Constant-time string comparison to prevent timing attacks.
fn constant_time_eq(a: &str, b: &str) -> bool {
    if a.len() != b.len() {
        return false;
    }

    let mut result = 0u8;
    for (x, y) in a.bytes().zip(b.bytes()) {
        result |= x ^ y;
    }
    result == 0
}

#[derive(Debug, Clone)]
pub enum HashError {
    InvalidAddress(String),
}

impl std::fmt::Display for HashError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            HashError::InvalidAddress(msg) => write!(f, "Invalid address: {}", msg),
        }
    }
}

impl std::error::Error for HashError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_hash() {
        let author = "0xace72a80e389bea3668bbe54bd4677bdef5c4b88d34eb553b7331643ceada5c5";
        let timestamp_ms = 1700000000000u64;
        let content = "Hello, Cord!";

        let hash = compute_content_hash(author, timestamp_ms, content).unwrap();

        // Hash should be 64 hex chars
        assert_eq!(hash.len(), 64);

        // Same inputs should produce same hash
        let hash2 = compute_content_hash(author, timestamp_ms, content).unwrap();
        assert_eq!(hash, hash2);

        // Different content should produce different hash
        let hash3 = compute_content_hash(author, timestamp_ms, "Different content").unwrap();
        assert_ne!(hash, hash3);
    }

    #[test]
    fn test_verify_hash() {
        let author = "0xace72a80e389bea3668bbe54bd4677bdef5c4b88d34eb553b7331643ceada5c5";
        let timestamp_ms = 1700000000000u64;
        let content = "Hello, Cord!";

        let hash = compute_content_hash(author, timestamp_ms, content).unwrap();

        // Verification should pass with correct inputs
        assert!(verify_content_hash(&hash, author, timestamp_ms, content).unwrap());

        // Verification should fail with wrong content
        assert!(!verify_content_hash(&hash, author, timestamp_ms, "Wrong content").unwrap());

        // Verification should fail with wrong timestamp
        assert!(!verify_content_hash(&hash, author, timestamp_ms + 1, content).unwrap());
    }

    #[test]
    fn test_address_without_prefix() {
        let author_with_prefix = "0xace72a80e389bea3668bbe54bd4677bdef5c4b88d34eb553b7331643ceada5c5";
        let author_without_prefix = "ace72a80e389bea3668bbe54bd4677bdef5c4b88d34eb553b7331643ceada5c5";
        let timestamp_ms = 1700000000000u64;
        let content = "Test";

        let hash1 = compute_content_hash(author_with_prefix, timestamp_ms, content).unwrap();
        let hash2 = compute_content_hash(author_without_prefix, timestamp_ms, content).unwrap();

        assert_eq!(hash1, hash2);
    }

    #[test]
    fn test_invalid_address() {
        let result = compute_content_hash("invalid", 0, "test");
        assert!(result.is_err());
    }
}
