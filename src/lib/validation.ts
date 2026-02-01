/**
 * Profile Validation Utilities
 *
 * Frontend validation mirroring backend rules for instant feedback.
 * Backend validation is authoritative - these provide UX improvements.
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// URL detection pattern (matches http://, https://, www., and domain patterns)
const URL_PATTERN = /(?:https?:\/\/|www\.)|(?:[a-z0-9][-a-z0-9]*\.[a-z]{2,}(?:\/|\s|$))/i;

// HTML tag detection pattern
const HTML_TAG_PATTERN = /<[^>]+>/;

// Control character pattern (except newline)
const CONTROL_CHAR_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

// Username pattern: lowercase letters, numbers, hyphens, 3-15 chars
const USERNAME_PATTERN = /^[a-z0-9-]+$/;

// Reserved usernames (must match backend)
const RESERVED_USERNAMES = new Set([
  // System/admin
  'admin', 'administrator', 'root', 'system', 'mod', 'moderator',
  'support', 'help', 'info', 'contact', 'team', 'staff',
  // API/technical
  'api', 'app', 'www', 'mail', 'email', 'ftp', 'ssh', 'ssl',
  'cdn', 'static', 'assets', 'media', 'upload', 'uploads',
  'download', 'downloads', 'file', 'files',
  // Actions
  'create', 'mint', 'delete', 'edit', 'update', 'remove',
  'login', 'logout', 'signin', 'signout', 'signup', 'register',
  'settings', 'config', 'configure', 'preferences',
  // Platform features
  'feed', 'plaza', 'explore', 'search', 'discover', 'trending',
  'notifications', 'messages', 'dm', 'dms', 'chat',
  'profile', 'profiles', 'user', 'users', 'account', 'accounts',
  'wallet', 'wallets', 'token', 'tokens', 'share', 'shares',
  'post', 'posts', 'comment', 'comments', 'like', 'likes',
  'follow', 'following', 'followers', 'unfollow',
  // Financial
  'buy', 'sell', 'trade', 'trading', 'swap', 'exchange',
  'price', 'market', 'markets', 'order', 'orders',
  'deposit', 'withdraw', 'transfer', 'send', 'receive',
  // Common reserved
  'null', 'undefined', 'none', 'void', 'test', 'testing',
  'demo', 'example', 'sample', 'default', 'official',
  'verified', 'anonymous', 'unknown', 'private', 'public',
  // Brand protection
  'cord', 'sui', 'suinetwork', 'mysten', 'anthropic', 'claude',
]);

/**
 * Check if text contains URL patterns
 */
export function containsUrl(text: string): boolean {
  return URL_PATTERN.test(text);
}

/**
 * Check if text contains HTML tags
 */
export function containsHtmlTags(text: string): boolean {
  return HTML_TAG_PATTERN.test(text);
}

/**
 * Check if text contains control characters
 */
export function containsControlChars(text: string): boolean {
  return CONTROL_CHAR_PATTERN.test(text);
}

/**
 * Count display characters (proper Unicode counting)
 * Each character (including CJK and emoji) counts as 1
 */
export function countDisplayChars(text: string): number {
  // Use spread operator to properly count Unicode characters
  return [...text].length;
}

/**
 * Validate username for profile update
 * Rules:
 * - 3-15 characters
 * - Only lowercase letters (a-z), numbers (0-9), hyphens (-)
 * - Cannot start or end with hyphen
 * - No consecutive hyphens
 * - Must contain at least one letter
 * - Cannot be a reserved word
 * - No URLs, HTML, or control characters
 */
export function validateUsername(username: string): ValidationResult {
  const trimmed = username.trim().toLowerCase();

  // Check for dangerous content first (security)
  if (containsUrl(trimmed)) {
    return { valid: false, error: 'Username cannot contain URLs' };
  }
  if (containsHtmlTags(trimmed)) {
    return { valid: false, error: 'Username cannot contain HTML' };
  }
  if (containsControlChars(trimmed)) {
    return { valid: false, error: 'Username contains invalid characters' };
  }

  // Length check
  if (trimmed.length < 3) {
    return { valid: false, error: 'Username must be at least 3 characters' };
  }
  if (trimmed.length > 15) {
    return { valid: false, error: 'Username must be 15 characters or less' };
  }

  // Character validation
  if (!USERNAME_PATTERN.test(trimmed)) {
    return { valid: false, error: 'Only letters, numbers, and hyphens allowed' };
  }

  // Hyphen rules
  if (trimmed.startsWith('-')) {
    return { valid: false, error: 'Username cannot start with a hyphen' };
  }
  if (trimmed.endsWith('-')) {
    return { valid: false, error: 'Username cannot end with a hyphen' };
  }
  if (trimmed.includes('--')) {
    return { valid: false, error: 'Username cannot contain consecutive hyphens' };
  }

  // Must contain at least one letter
  if (!/[a-z]/.test(trimmed)) {
    return { valid: false, error: 'Username must contain at least one letter' };
  }

  // Reserved words
  if (RESERVED_USERNAMES.has(trimmed)) {
    return { valid: false, error: 'This username is reserved' };
  }

  return { valid: true };
}

/**
 * Validate bio field
 * Rules:
 * - Max 50 characters (Unicode-aware)
 * - No URLs
 * - No HTML tags
 * - No control characters (except newline)
 * - Allows emojis, CJK characters
 */
export function validateBio(bio: string): ValidationResult {
  const trimmed = bio.trim();

  // Check max length (50 characters)
  const charCount = countDisplayChars(trimmed);
  if (charCount > 50) {
    return { valid: false, error: `Bio is too long (${charCount}/50 characters)` };
  }

  // Check for URLs
  if (containsUrl(trimmed)) {
    return { valid: false, error: 'Bio cannot contain URLs or links' };
  }

  // Check for HTML tags
  if (containsHtmlTags(trimmed)) {
    return { valid: false, error: 'Bio cannot contain HTML tags' };
  }

  // Check for control characters
  if (containsControlChars(trimmed)) {
    return { valid: false, error: 'Bio contains invalid characters' };
  }

  return { valid: true };
}

/**
 * Validate avatar URL
 * Rules:
 * - Must be empty OR from allowed R2 domain
 */
export function validateAvatarUrl(url: string): ValidationResult {
  const trimmed = url.trim();

  // Empty is valid (will use default avatar)
  if (trimmed === '') {
    return { valid: true };
  }

  // Must be a valid URL
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return { valid: false, error: 'Invalid avatar URL format' };
  }

  // Check for allowed domains (R2 CDN)
  const allowedPatterns = ['img.c0rd.xyz', 'pub-', 'r2.dev', 'r2.cloudflarestorage.com', 'localhost'];
  const isAllowed = allowedPatterns.some(pattern => trimmed.includes(pattern));

  if (!isAllowed) {
    return { valid: false, error: 'Avatar must be uploaded through the app' };
  }

  return { valid: true };
}

/**
 * Normalize username (lowercase, trim)
 */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}
