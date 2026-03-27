// API service for Cord backend
// In production, set VITE_API_BASE_URL to the deployed backend URL.
// In local dev, falls back to same hostname:3001 so LAN devices work.
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  `http://${window.location.hostname}:3001/api`;

export interface User {
  id: string;
  wallet_address?: string;
  email?: string;
  username: string;
  avatar_url?: string;
  bio?: string;
  token_symbol: string;
  followers_count: number;
  following_count: number;
  posts_count: number;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  username: string;
  avatar_url?: string;
  token_symbol: string;
  wallet_address?: string;
  bio?: string;
  followers_count?: number;
}

export interface Post {
  id: string;
  author_id: string;
  content: string;
  media_urls: string[];
  content_blob_id?: string;
  content_protocol_version?: string;
  /** SHA256 hash for on-chain attestation */
  content_hash?: string;
  /** Timestamp used in hash computation (Unix ms) */
  hash_timestamp_ms?: number;
  likes_count: number;
  comments_count: number;
  reposts_count: number;
  created_at: string;
  updated_at: string;
}

/** Response from creating a post, includes hash info for on-chain attestation */
export interface CreatePostResponse {
  post: Post;
  /** Hash to submit on-chain: SHA256(author[32] || timestamp_ms[8 BE] || content) */
  content_hash: string;
  /** Timestamp used in hash computation (Unix milliseconds) */
  timestamp_ms: number;
  /** Hash as bytes array for Move contract */
  content_hash_bytes: number[];
}

/** Request to verify a post hash */
export interface VerifyPostHashRequest {
  post_id: string;
  content_hash: string;
}

/** Response from hash verification */
export interface VerifyPostHashResponse {
  valid: boolean;
  post_id: string;
  author: string;
  timestamp_ms: number;
  content_preview: string;
}

export interface PostWithAuthor {
  id: string;
  author_id: string;
  content: string;
  media_urls: string[];
  content_blob_id?: string;
  content_protocol_version?: string;
  likes_count: number;
  comments_count: number;
  reposts_count: number;
  created_at: string;
  updated_at: string;
  author: UserProfile;
}

export interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  parent_comment_id?: string | null;
  created_at: string;
}

export interface CommentWithAuthor {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  parent_comment_id?: string | null;
  created_at: string;
  author: UserProfile;
}

export interface Notification {
  id: string;
  user_id: string;
  content: string;
  notification_type: string;
  status: 'pending' | 'sent' | 'failed' | 'read';
  related_id?: string;
  detail?: string;
  actor_id?: string;
  actor_username?: string;
  actor_avatar_url?: string;
  created_at: string;
}

export interface FollowStatusResponse {
  is_following: boolean;
  followers_count: number;
  following_count: number;
}

export interface UsernameCheckResponse {
  available: boolean;
  normalized: string;
  error?: string;
}

// Media upload types (R2)
export interface MediaUploadResponse {
  file_key: string;
  public_url: string;
  content_type: string;
  size_bytes: number;
  checksum: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface CreatorTokenBuildResponse {
  package_name: string;
  module_name: string;
  type_name: string;
  token_name: string;
  token_symbol: string;
  modules: string[];
  dependencies: string[];
}

export interface RecordSwapRequest {
  pool_id: string;
  trader: string;
  side: 'buy' | 'sell';
  sui_amount_mist: number;
  token_amount: number;
  price_sui: number;
  timestamp_ms: number;
  tx_digest?: string;
}

export interface OhlcvCandle {
  time_ms: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume_sui: number;
  trade_count: number;
}

export type OhlcvInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export interface GraduationLaunchStatus {
  owner_address: string;
  market_id: string;
  token_name: string;
  token_symbol: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  step: string;
  error?: string;
  package_id?: string;
  token_type?: string;
  vault_id?: string;
  pool_id?: string;
  operator_address: string;
  created_at: string;
  updated_at: string;
}

class ApiService {
  private async request<T>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  // User endpoints

  /**
   * Check if a username is available and valid.
   * Returns validation errors if the username is invalid or already taken.
   */
  async checkUsername(username: string): Promise<ApiResponse<UsernameCheckResponse>> {
    return this.request<UsernameCheckResponse>(`/users/check-username/${encodeURIComponent(username)}`);
  }

  async createUser(userData: {
    wallet_address?: string;
    email?: string;
    username: string;
    bio?: string;
    avatar_url?: string;
  }): Promise<ApiResponse<User>> {
    return this.request<User>('/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  async buildCreatorTokenPackage(payload: {
    owner_address: string;
    token_name: string;
    token_symbol: string;
    auth_nonce: string;
    auth_timestamp_ms: number;
    auth_signature: string;
  }): Promise<ApiResponse<CreatorTokenBuildResponse>> {
    return this.request<CreatorTokenBuildResponse>('/creator-token/build', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async requestGraduationLaunch(payload: {
    owner_address: string;
    market_id: string;
    token_name: string;
    token_symbol: string;
    auth_nonce: string;
    auth_timestamp_ms: number;
    auth_signature: string;
  }): Promise<ApiResponse<GraduationLaunchStatus>> {
    return this.request<GraduationLaunchStatus>('/graduation/launch', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getGraduationLaunchStatus(ownerAddress: string): Promise<ApiResponse<GraduationLaunchStatus>> {
    return this.request<GraduationLaunchStatus>(`/graduation/status/${ownerAddress}`);
  }

  async getUser(userId: string): Promise<ApiResponse<User>> {
    return this.request<User>(`/users/${userId}`);
  }

  async getUserByAddress(walletAddress: string): Promise<ApiResponse<User>> {
    return this.request<User>(`/users/by-address/${walletAddress}`);
  }

  async updateUserProfile(userId: string, profileData: {
    username?: string;
    bio?: string;
    avatar_url?: string;
  }): Promise<ApiResponse<User>> {
    return this.request<User>(`/users/${userId}/profile`, {
      method: 'POST',
      body: JSON.stringify(profileData),
    });
  }

  async getUserPosts(userId: string, limit = 20, offset = 0): Promise<ApiResponse<PostWithAuthor[]>> {
    return this.request<PostWithAuthor[]>(`/users/${userId}/posts?limit=${limit}&offset=${offset}`);
  }

  // Post endpoints
  async getPosts(limit = 20, offset = 0): Promise<ApiResponse<PostWithAuthor[]>> {
    return this.request<PostWithAuthor[]>(`/posts?limit=${limit}&offset=${offset}`);
  }

  // Plaza global feed (public timeline, newest-first)
  async getPlazaPosts(limit = 20, offset = 0): Promise<ApiResponse<PostWithAuthor[]>> {
    return this.request<PostWithAuthor[]>(`/plaza?limit=${limit}&offset=${offset}`);
  }

  // Comment endpoints
  async getPostComments(postId: string, limit = 50, offset = 0): Promise<ApiResponse<CommentWithAuthor[]>> {
    return this.request<CommentWithAuthor[]>(`/posts/${postId}/comments?limit=${limit}&offset=${offset}`);
  }

  async createComment(
    postId: string,
    commentData: {
      user_id: string;
      content: string;
      parent_comment_id?: string | null;
      reply_to_user_id?: string | null;
    }
  ): Promise<ApiResponse<CommentWithAuthor>> {
    return this.request<CommentWithAuthor>(`/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify(commentData),
    });
  }

  /**
   * Create a post and get hash info for on-chain attestation.
   *
   * The response includes:
   * - post: The created post object
   * - content_hash: SHA256 hash to submit on-chain
   * - timestamp_ms: Timestamp used in hash computation
   * - content_hash_bytes: Hash as byte array for Move contract
   */
  async createPost(postData: {
    author_id: string;
    wallet_address: string;
    content: string;
    media_urls?: string[];
  }): Promise<ApiResponse<CreatePostResponse>> {
    return this.request<CreatePostResponse>('/posts', {
      method: 'POST',
      body: JSON.stringify(postData),
    });
  }

  /**
   * Verify a post's content hash against stored data.
   * Used to verify on-chain attestations.
   */
  async verifyPostHash(request: VerifyPostHashRequest): Promise<ApiResponse<VerifyPostHashResponse>> {
    return this.request<VerifyPostHashResponse>('/posts/verify-hash', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async likePost(postId: string, userId: string): Promise<ApiResponse<boolean>> {
    return this.request<boolean>(`/posts/${postId}/like`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    });
  }

  async deletePost(postId: string, userId: string): Promise<ApiResponse<boolean>> {
    return this.request<boolean>(`/posts/${postId}`, {
      method: 'DELETE',
      body: JSON.stringify({ user_id: userId }),
    });
  }

  // Follow/unfollow endpoints
  async followUser(userId: string, followerId: string): Promise<ApiResponse<FollowStatusResponse>> {
    return this.request<FollowStatusResponse>(`/users/${userId}/follow`, {
      method: 'POST',
      body: JSON.stringify({ follower_id: followerId }),
    });
  }

  async unfollowUser(userId: string, followerId: string): Promise<ApiResponse<FollowStatusResponse>> {
    return this.request<FollowStatusResponse>(`/users/${userId}/unfollow`, {
      method: 'POST',
      body: JSON.stringify({ follower_id: followerId }),
    });
  }

  async getFollowStatus(userId: string, followerId: string): Promise<ApiResponse<FollowStatusResponse>> {
    return this.request<FollowStatusResponse>(`/users/${userId}/follow-status?follower_id=${followerId}`);
  }

  async getUserFollowers(userId: string): Promise<ApiResponse<UserProfile[]>> {
    return this.request<UserProfile[]>(`/users/${userId}/followers`);
  }

  async getUserFollowing(userId: string): Promise<ApiResponse<UserProfile[]>> {
    return this.request<UserProfile[]>(`/users/${userId}/following`);
  }

  // News feed endpoint
  async getNewsFeed(userId: string, limit = 20, offset = 0): Promise<ApiResponse<PostWithAuthor[]>> {
    return this.request<PostWithAuthor[]>(`/users/${userId}/feed?limit=${limit}&offset=${offset}`);
  }

  // Notification endpoints
  async getUserNotifications(userId: string): Promise<ApiResponse<Notification[]>> {
    return this.request<Notification[]>(`/notifications/${userId}`);
  }

  async markNotificationRead(notificationId: string): Promise<ApiResponse<string>> {
    return this.request<string>(`/notifications/${notificationId}/mark-read`, {
      method: 'POST',
    });
  }

  async markAllNotificationsRead(userId: string): Promise<ApiResponse<string>> {
    return this.request<string>(`/notifications/${userId}/mark-all-read`, {
      method: 'POST',
    });
  }

  // Search endpoints
  async searchUsers(query: string, limit = 20, offset = 0): Promise<ApiResponse<UserProfile[]>> {
    return this.request<UserProfile[]>(`/search/users?q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`);
  }

  // Media upload endpoints (R2)
  async uploadMedia(file: File, userId: string): Promise<ApiResponse<MediaUploadResponse>> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('user_id', userId);

    try {
      const response = await fetch(`${API_BASE_URL}/media/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Media upload failed:', error);
      throw error;
    }
  }

  async batchUploadMedia(files: File[], userId: string): Promise<ApiResponse<MediaUploadResponse[]>> {
    console.log('🔍 batchUploadMedia called with:', {
      fileCount: files.length,
      userId,
      files: files.map(f => ({name: f.name, type: f.type, size: f.size}))
    });

    const formData = new FormData();

    files.forEach((file, index) => {
      formData.append(`file_${index}`, file);
    });
    formData.append('user_id', userId);

    console.log('📦 FormData contents:');
    for (const [key, value] of formData.entries()) {
      console.log(key, value);
    }

    try {
      const response = await fetch(`${API_BASE_URL}/media/batch-upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Batch upload failed:', error);
      throw error;
    }
  }

  // AMM OHLCV endpoints
  async recordSwap(req: RecordSwapRequest): Promise<ApiResponse<string>> {
    return this.request<string>(`/amm/${req.pool_id}/swap`, {
      method: 'POST',
      body: JSON.stringify(req),
    });
  }

  async getOhlcv(
    poolId: string,
    interval: OhlcvInterval = '5m',
    limit = 200,
  ): Promise<ApiResponse<OhlcvCandle[]>> {
    return this.request<OhlcvCandle[]>(
      `/amm/${poolId}/ohlcv?interval=${interval}&limit=${limit}`,
    );
  }

  // Health check
  async healthCheck(): Promise<ApiResponse<string>> {
    return this.request<string>('/health');
  }
}

// Utility functions for protocol content
export function extractMentions(text: string): string[] {
  const mentionRegex = /@(\w+)/g;
  const matches = text.matchAll(mentionRegex);
  return Array.from(matches, m => m[1]);
}

export function extractHashtags(text: string): string[] {
  const hashtagRegex = /#(\w+)/g;
  const matches = text.matchAll(hashtagRegex);
  return Array.from(matches, m => m[1]);
}

export const apiService = new ApiService();
