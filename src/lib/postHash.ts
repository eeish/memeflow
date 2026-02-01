/**
 * Post Content Hash Module
 *
 * Computes SHA256 hashes for on-chain post attestation.
 *
 * Hash Structure:
 *   SHA256(author[32 bytes] || timestamp_ms[8 bytes BE] || content[*])
 *
 * - author: 32-byte Sui address (hex-decoded, without 0x prefix)
 * - timestamp_ms: Unix timestamp in milliseconds (big-endian u64)
 * - content: UTF-8 encoded post content
 */

/**
 * Parse a Sui address string into a 32-byte Uint8Array.
 */
function parseSuiAddress(address: string): Uint8Array {
  // Remove 0x prefix if present
  const hexStr = address.startsWith('0x') ? address.slice(2) : address;

  // Validate length (64 hex chars = 32 bytes)
  if (hexStr.length !== 64) {
    throw new Error(`Address must be 64 hex characters, got ${hexStr.length}`);
  }

  // Decode hex to bytes
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hexStr.slice(i * 2, i * 2 + 2), 16);
  }

  return bytes;
}

/**
 * Convert a u64 timestamp to 8-byte big-endian array.
 */
function timestampToBytes(timestampMs: number): Uint8Array {
  const bytes = new Uint8Array(8);
  const bigInt = BigInt(timestampMs);

  for (let i = 7; i >= 0; i--) {
    bytes[i] = Number(bigInt & BigInt(0xff));
    // @ts-expect-error - bitwise operation on bigint
    timestampMs = bigInt >> BigInt(8 * (7 - i));
  }

  // Manual big-endian conversion
  bytes[0] = Number((bigInt >> BigInt(56)) & BigInt(0xff));
  bytes[1] = Number((bigInt >> BigInt(48)) & BigInt(0xff));
  bytes[2] = Number((bigInt >> BigInt(40)) & BigInt(0xff));
  bytes[3] = Number((bigInt >> BigInt(32)) & BigInt(0xff));
  bytes[4] = Number((bigInt >> BigInt(24)) & BigInt(0xff));
  bytes[5] = Number((bigInt >> BigInt(16)) & BigInt(0xff));
  bytes[6] = Number((bigInt >> BigInt(8)) & BigInt(0xff));
  bytes[7] = Number(bigInt & BigInt(0xff));

  return bytes;
}

/**
 * Convert a byte array to hex string.
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Compute the content hash for on-chain attestation.
 *
 * @param author - Sui address (with or without 0x prefix)
 * @param timestampMs - Unix timestamp in milliseconds
 * @param content - UTF-8 post content
 * @returns 64-character hex string (SHA256 hash without 0x prefix)
 */
export async function computeContentHash(
  author: string,
  timestampMs: number,
  content: string
): Promise<string> {
  // Parse author address to 32 bytes
  const authorBytes = parseSuiAddress(author);

  // Convert timestamp to 8-byte big-endian
  const timestampBytes = timestampToBytes(timestampMs);

  // Encode content as UTF-8
  const contentBytes = new TextEncoder().encode(content);

  // Concatenate: author[32] || timestamp[8] || content[*]
  const preimage = new Uint8Array(
    authorBytes.length + timestampBytes.length + contentBytes.length
  );
  preimage.set(authorBytes, 0);
  preimage.set(timestampBytes, 32);
  preimage.set(contentBytes, 40);

  // Compute SHA256 using Web Crypto API
  const hashBuffer = await crypto.subtle.digest('SHA-256', preimage);
  const hashBytes = new Uint8Array(hashBuffer);

  return bytesToHex(hashBytes);
}

/**
 * Verify that a hash matches the given inputs.
 *
 * @param hash - Expected hash (64 hex chars, no 0x prefix)
 * @param author - Sui address
 * @param timestampMs - Unix timestamp in milliseconds
 * @param content - Post content
 * @returns true if the hash matches
 */
export async function verifyContentHash(
  hash: string,
  author: string,
  timestampMs: number,
  content: string
): Promise<boolean> {
  const computed = await computeContentHash(author, timestampMs, content);
  return hash.toLowerCase() === computed.toLowerCase();
}

/**
 * Convert a hex hash string to byte array for Move contract.
 *
 * @param hash - 64-character hex string
 * @returns Array of 32 numbers (bytes)
 */
export function hashToBytes(hash: string): number[] {
  const hexStr = hash.startsWith('0x') ? hash.slice(2) : hash;
  if (hexStr.length !== 64) {
    throw new Error(`Hash must be 64 hex characters, got ${hexStr.length}`);
  }

  const bytes: number[] = [];
  for (let i = 0; i < 32; i++) {
    bytes.push(parseInt(hexStr.slice(i * 2, i * 2 + 2), 16));
  }

  return bytes;
}
