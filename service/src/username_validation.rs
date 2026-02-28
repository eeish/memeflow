use once_cell::sync::Lazy;
/// Phase 1 Username Validation Module
///
/// Rules:
/// - Length: 3-15 characters (trim whitespace)
/// - Allowed characters: a-z, 0-9, - (hyphen)
/// - Case-insensitive, normalized to lowercase
/// - Cannot start or end with hyphen
/// - No consecutive hyphens (--)
/// - Cannot be digits-only; must contain at least one letter
/// - Reserved words are blocked
use std::collections::HashSet;

/// Reserved usernames that cannot be used
static RESERVED_USERNAMES: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    [
        // System/admin
        "admin",
        "administrator",
        "root",
        "system",
        "mod",
        "moderator",
        "support",
        "help",
        "info",
        "contact",
        "team",
        "staff",
        // API/technical
        "api",
        "app",
        "www",
        "mail",
        "email",
        "ftp",
        "ssh",
        "ssl",
        "cdn",
        "static",
        "assets",
        "media",
        "upload",
        "uploads",
        "download",
        "downloads",
        "file",
        "files",
        // Actions
        "create",
        "mint",
        "delete",
        "edit",
        "update",
        "remove",
        "login",
        "logout",
        "signin",
        "signout",
        "signup",
        "register",
        "settings",
        "config",
        "configure",
        "preferences",
        // Platform features
        "feed",
        "plaza",
        "explore",
        "search",
        "discover",
        "trending",
        "notifications",
        "messages",
        "dm",
        "dms",
        "chat",
        "profile",
        "profiles",
        "user",
        "users",
        "account",
        "accounts",
        "wallet",
        "wallets",
        "token",
        "tokens",
        "share",
        "shares",
        "post",
        "posts",
        "comment",
        "comments",
        "like",
        "likes",
        "follow",
        "following",
        "followers",
        "unfollow",
        // Financial
        "buy",
        "sell",
        "trade",
        "trading",
        "swap",
        "exchange",
        "price",
        "market",
        "markets",
        "order",
        "orders",
        "deposit",
        "withdraw",
        "transfer",
        "send",
        "receive",
        // Common reserved
        "null",
        "undefined",
        "none",
        "void",
        "test",
        "testing",
        "demo",
        "example",
        "sample",
        "default",
        "official",
        "verified",
        "anonymous",
        "unknown",
        "private",
        "public",
        // Brand protection
        "cord",
        "sui",
        "suinetwork",
        "mysten",
        "anthropic",
        "claude",
    ]
    .into_iter()
    .collect()
});

#[derive(Debug, Clone, PartialEq)]
pub enum UsernameValidationError {
    TooShort,
    TooLong,
    InvalidCharacters,
    StartsWithHyphen,
    EndsWithHyphen,
    ConsecutiveHyphens,
    DigitsOnly,
    Reserved,
    AlreadyTaken,
}

impl std::fmt::Display for UsernameValidationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::TooShort => write!(f, "Username must be at least 3 characters"),
            Self::TooLong => write!(f, "Username must be 15 characters or less"),
            Self::InvalidCharacters => write!(f, "Only letters, numbers, and hyphens allowed"),
            Self::StartsWithHyphen => write!(f, "Username cannot start with a hyphen"),
            Self::EndsWithHyphen => write!(f, "Username cannot end with a hyphen"),
            Self::ConsecutiveHyphens => write!(f, "Username cannot contain consecutive hyphens"),
            Self::DigitsOnly => write!(f, "Username must contain at least one letter"),
            Self::Reserved => write!(f, "This username is reserved"),
            Self::AlreadyTaken => write!(f, "This username is already taken"),
        }
    }
}

/// Sanitize input by replacing invalid characters with hyphens
/// and normalizing to lowercase
pub fn sanitize_username(input: &str) -> String {
    let trimmed = input.trim().to_lowercase();

    let mut result = String::with_capacity(trimmed.len());
    let mut last_was_hyphen = false;

    for c in trimmed.chars() {
        if c.is_ascii_lowercase() || c.is_ascii_digit() {
            result.push(c);
            last_was_hyphen = false;
        } else if c == '-' || c == '_' || c.is_whitespace() {
            // Replace underscores and whitespace with hyphens
            // Avoid consecutive hyphens
            if !last_was_hyphen && !result.is_empty() {
                result.push('-');
                last_was_hyphen = true;
            }
        }
        // Other characters are simply dropped
    }

    // Remove trailing hyphen
    while result.ends_with('-') {
        result.pop();
    }

    result
}

/// Validate a username according to Phase 1 rules
pub fn validate_username(username: &str) -> Result<String, UsernameValidationError> {
    // Trim and normalize to lowercase
    let normalized = username.trim().to_lowercase();

    // Check length (3-15 characters)
    if normalized.len() < 3 {
        return Err(UsernameValidationError::TooShort);
    }
    if normalized.len() > 15 {
        return Err(UsernameValidationError::TooLong);
    }

    // Check for valid characters (a-z, 0-9, -)
    if !normalized
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
    {
        return Err(UsernameValidationError::InvalidCharacters);
    }

    // Check hyphen rules
    if normalized.starts_with('-') {
        return Err(UsernameValidationError::StartsWithHyphen);
    }
    if normalized.ends_with('-') {
        return Err(UsernameValidationError::EndsWithHyphen);
    }
    if normalized.contains("--") {
        return Err(UsernameValidationError::ConsecutiveHyphens);
    }

    // Check that it's not digits-only (must contain at least one letter)
    if !normalized.chars().any(|c| c.is_ascii_lowercase()) {
        return Err(UsernameValidationError::DigitsOnly);
    }

    // Check reserved words
    if RESERVED_USERNAMES.contains(normalized.as_str()) {
        return Err(UsernameValidationError::Reserved);
    }

    Ok(normalized)
}

/// Check if a username is reserved
pub fn is_reserved(username: &str) -> bool {
    RESERVED_USERNAMES.contains(username.to_lowercase().as_str())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_usernames() {
        assert!(validate_username("alice").is_ok());
        assert!(validate_username("bob123").is_ok());
        assert!(validate_username("user-name").is_ok());
        assert!(validate_username("a1b2c3").is_ok());
        assert!(validate_username("ABC").is_ok()); // normalized to lowercase
        assert!(validate_username("  trimmed  ").is_ok());
    }

    #[test]
    fn test_length_validation() {
        assert_eq!(
            validate_username("ab"),
            Err(UsernameValidationError::TooShort)
        );
        assert_eq!(
            validate_username("a"),
            Err(UsernameValidationError::TooShort)
        );
        assert_eq!(
            validate_username(""),
            Err(UsernameValidationError::TooShort)
        );
        assert!(validate_username("abc").is_ok());
        assert!(validate_username("fifteencharacte").is_ok()); // 15 chars
        assert_eq!(
            validate_username("sixteencharacter"),
            Err(UsernameValidationError::TooLong)
        );
    }

    #[test]
    fn test_invalid_characters() {
        assert_eq!(
            validate_username("user@name"),
            Err(UsernameValidationError::InvalidCharacters)
        );
        assert_eq!(
            validate_username("user.name"),
            Err(UsernameValidationError::InvalidCharacters)
        );
        assert_eq!(
            validate_username("user_name"),
            Err(UsernameValidationError::InvalidCharacters)
        );
        assert_eq!(
            validate_username("user name"),
            Err(UsernameValidationError::InvalidCharacters)
        );
    }

    #[test]
    fn test_hyphen_rules() {
        assert_eq!(
            validate_username("-user"),
            Err(UsernameValidationError::StartsWithHyphen)
        );
        assert_eq!(
            validate_username("user-"),
            Err(UsernameValidationError::EndsWithHyphen)
        );
        assert_eq!(
            validate_username("user--name"),
            Err(UsernameValidationError::ConsecutiveHyphens)
        );
        assert!(validate_username("user-name").is_ok());
    }

    #[test]
    fn test_digits_only() {
        assert_eq!(
            validate_username("123"),
            Err(UsernameValidationError::DigitsOnly)
        );
        assert_eq!(
            validate_username("12345"),
            Err(UsernameValidationError::DigitsOnly)
        );
        assert!(validate_username("a123").is_ok());
        assert!(validate_username("123a").is_ok());
    }

    #[test]
    fn test_reserved_words() {
        assert_eq!(
            validate_username("admin"),
            Err(UsernameValidationError::Reserved)
        );
        assert_eq!(
            validate_username("ADMIN"),
            Err(UsernameValidationError::Reserved)
        );
        assert_eq!(
            validate_username("support"),
            Err(UsernameValidationError::Reserved)
        );
        assert_eq!(
            validate_username("api"),
            Err(UsernameValidationError::Reserved)
        );
    }

    #[test]
    fn test_sanitize() {
        assert_eq!(sanitize_username("User_Name"), "user-name");
        assert_eq!(sanitize_username("Hello World"), "hello-world");
        assert_eq!(sanitize_username("test@#$abc"), "testabc");
        assert_eq!(sanitize_username("  spaced  "), "spaced");
        assert_eq!(sanitize_username("trailing-"), "trailing");
    }
}
