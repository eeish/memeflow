/// Profile Validation Module
///
/// Provides validation for profile fields (username, bio, avatar_url) with security checks.
/// These validations protect against XSS, injection attacks, and ensure data quality.
use crate::username_validation::{validate_username, UsernameValidationError};
use once_cell::sync::Lazy;
use regex::Regex;

/// Allowed R2 CDN domains for avatar URLs
const ALLOWED_AVATAR_DOMAINS: &[&str] = &[
    "img.c0rd.xyz", // Production R2 public domain
    "pub-",         // Cloudflare R2 public bucket prefix
    "r2.dev",
    "r2.cloudflarestorage.com",
    "localhost",
];

/// URL detection patterns - require at least 3 char TLD and must look like a domain
static URL_PATTERN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)(https?://|www\.)|([a-z0-9][-a-z0-9]*\.[a-z]{3,}(/|\s|$))").unwrap()
});

/// HTML tag detection pattern - matches common HTML tags but not comparison operators
/// Pattern: <tag>, </tag>, <tag/>, <tag attr>
/// Requires tag name followed by optional whitespace/attrs then closing >
static HTML_TAG_PATTERN: Lazy<Regex> = Lazy::new(|| {
    // Match opening tags like <div>, <br/>, <img src="x">
    // Match closing tags like </div>
    // Require that after tag name, only valid HTML follows (space, =, quotes, word chars)
    Regex::new(r"</?[a-zA-Z][a-zA-Z0-9]*(?:\s[^>]*)?>").unwrap()
});

/// Control character pattern (except newline and carriage return)
static CONTROL_CHAR_PATTERN: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]").unwrap());

#[derive(Debug, Clone, PartialEq)]
pub enum ProfileValidationError {
    TooShort,
    TooLong,
    ContainsUrl,
    ContainsHtml,
    ContainsDangerousChars,
    InvalidAvatarDomain,
    Reserved,
    AlreadyTaken,
    UsernameError(UsernameValidationError),
}

impl std::fmt::Display for ProfileValidationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::TooShort => write!(f, "Text is too short"),
            Self::TooLong => write!(f, "Text is too long"),
            Self::ContainsUrl => write!(f, "URLs are not allowed"),
            Self::ContainsHtml => write!(f, "HTML tags are not allowed"),
            Self::ContainsDangerousChars => write!(f, "Invalid characters detected"),
            Self::InvalidAvatarDomain => write!(f, "Avatar URL must be from an allowed domain"),
            Self::Reserved => write!(f, "This value is reserved"),
            Self::AlreadyTaken => write!(f, "This username is already taken"),
            Self::UsernameError(e) => write!(f, "{}", e),
        }
    }
}

impl From<UsernameValidationError> for ProfileValidationError {
    fn from(e: UsernameValidationError) -> Self {
        ProfileValidationError::UsernameError(e)
    }
}

/// Check if text contains URL patterns
pub fn contains_url(text: &str) -> bool {
    URL_PATTERN.is_match(text)
}

/// Check if text contains HTML tags
pub fn contains_html_tags(text: &str) -> bool {
    HTML_TAG_PATTERN.is_match(text)
}

/// Check if text contains control characters (except newline)
pub fn contains_control_chars(text: &str) -> bool {
    CONTROL_CHAR_PATTERN.is_match(text)
}

/// Count display characters (each character counts as 1, including CJK and emoji)
pub fn count_display_chars(text: &str) -> usize {
    text.chars().count()
}

/// Validate username for profile update
/// Reuses existing username validation rules and adds URL/HTML checks
pub fn validate_username_for_update(username: &str) -> Result<String, ProfileValidationError> {
    // First check for URLs and HTML (security)
    if contains_url(username) {
        return Err(ProfileValidationError::ContainsUrl);
    }
    if contains_html_tags(username) {
        return Err(ProfileValidationError::ContainsHtml);
    }
    if contains_control_chars(username) {
        return Err(ProfileValidationError::ContainsDangerousChars);
    }

    // Then use existing username validation
    validate_username(username).map_err(ProfileValidationError::from)
}

/// Validate bio field
/// - Max 50 characters (Unicode-aware)
/// - No URLs or HTML tags
/// - No control characters (except newline)
/// - Allows emojis, CJK characters, limited line breaks
pub fn validate_bio(bio: &str) -> Result<String, ProfileValidationError> {
    let trimmed = bio.trim();

    // Check max length (50 characters)
    if count_display_chars(trimmed) > 50 {
        return Err(ProfileValidationError::TooLong);
    }

    // Check for URLs
    if contains_url(trimmed) {
        return Err(ProfileValidationError::ContainsUrl);
    }

    // Check for HTML tags
    if contains_html_tags(trimmed) {
        return Err(ProfileValidationError::ContainsHtml);
    }

    // Check for control characters (allow newlines)
    if contains_control_chars(trimmed) {
        return Err(ProfileValidationError::ContainsDangerousChars);
    }

    // Limit consecutive newlines to 2
    let normalized = trimmed.lines().collect::<Vec<_>>().join("\n");

    // Collapse more than 2 consecutive newlines
    let re = Regex::new(r"\n{3,}").unwrap();
    let normalized = re.replace_all(&normalized, "\n\n").to_string();

    Ok(normalized)
}

/// Validate avatar URL
/// - Must be empty/null OR from allowed R2 domain
pub fn validate_avatar_url(url: &str) -> Result<Option<String>, ProfileValidationError> {
    let trimmed = url.trim();

    // Empty URL is valid (will use default avatar)
    if trimmed.is_empty() {
        return Ok(None);
    }

    // Check if URL is from an allowed domain
    let is_allowed = ALLOWED_AVATAR_DOMAINS
        .iter()
        .any(|domain| trimmed.contains(domain));

    if !is_allowed {
        return Err(ProfileValidationError::InvalidAvatarDomain);
    }

    // Basic URL validation
    if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
        return Err(ProfileValidationError::InvalidAvatarDomain);
    }

    Ok(Some(trimmed.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_contains_url() {
        assert!(contains_url("check out https://example.com"));
        assert!(contains_url("visit www.example.com"));
        assert!(contains_url("go to example.com/path"));
        assert!(!contains_url("hello world"));
        assert!(!contains_url("user@example"));
        assert!(!contains_url("test.ts")); // Too short TLD
        assert!(!contains_url("file.rs")); // Too short TLD
    }

    #[test]
    fn test_contains_html() {
        // Common XSS vectors
        assert!(contains_html_tags("<script>alert(1)</script>"));
        assert!(contains_html_tags("<div>content</div>"));
        assert!(contains_html_tags("text <b>bold</b> text"));
        assert!(contains_html_tags("</div>"));
        assert!(contains_html_tags("<img src=x onerror=alert(1)>"));
        // Safe content
        assert!(!contains_html_tags("1 < 2 and 3 > 2")); // Math expression
        assert!(!contains_html_tags("normal text"));
        assert!(!contains_html_tags("a < b")); // Simple comparison
    }

    #[test]
    fn test_count_display_chars() {
        assert_eq!(count_display_chars("hello"), 5);
        assert_eq!(count_display_chars("你好"), 2);
        assert_eq!(count_display_chars("hello你好"), 7);
        assert_eq!(count_display_chars(""), 0);
    }

    #[test]
    fn test_validate_bio() {
        // Valid bios
        assert!(validate_bio("Hello world!").is_ok());
        assert!(validate_bio("你好世界").is_ok());
        assert!(validate_bio("Line 1\nLine 2").is_ok());

        // Too long
        let long_bio = "a".repeat(51);
        assert_eq!(
            validate_bio(&long_bio),
            Err(ProfileValidationError::TooLong)
        );

        // Contains URL
        assert_eq!(
            validate_bio("check https://example.com"),
            Err(ProfileValidationError::ContainsUrl)
        );

        // Contains HTML
        assert_eq!(
            validate_bio("text <b>bold</b>"),
            Err(ProfileValidationError::ContainsHtml)
        );
    }

    #[test]
    fn test_validate_avatar_url() {
        // Empty is valid
        assert_eq!(validate_avatar_url(""), Ok(None));
        assert_eq!(validate_avatar_url("  "), Ok(None));

        // Valid R2 URLs
        assert!(validate_avatar_url("https://pub-abc123.r2.dev/avatar.jpg").is_ok());

        // Invalid domain
        assert_eq!(
            validate_avatar_url("https://evil.com/avatar.jpg"),
            Err(ProfileValidationError::InvalidAvatarDomain)
        );

        // Invalid protocol
        assert_eq!(
            validate_avatar_url("ftp://r2.dev/file"),
            Err(ProfileValidationError::InvalidAvatarDomain)
        );
    }

    #[test]
    fn test_validate_username_for_update() {
        // Valid usernames
        assert!(validate_username_for_update("alice").is_ok());
        assert!(validate_username_for_update("bob-123").is_ok());

        // Contains URL
        assert_eq!(
            validate_username_for_update("user.com"),
            Err(ProfileValidationError::ContainsUrl)
        );

        // Reuses existing validation
        assert!(matches!(
            validate_username_for_update("ab"),
            Err(ProfileValidationError::UsernameError(
                UsernameValidationError::TooShort
            ))
        ));
    }
}
