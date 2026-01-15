// API service for MemeFlow backend
const API_BASE_URL = 'http://localhost:3001/api';

export interface User {
  id: string;
  wallet_address?: string;
  email?: string;
  username: string;
  display_name?: string;
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
  display_name?: string;
  avatar_url?: string;
  token_symbol: string;
}

export interface Post {
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

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  content: string;
  notification_type: 'like' | 'comment' | 'follow' | 'mention' | 'token_update';
  related_id?: string;
  is_read: boolean;
  created_at: string;
}

export interface FollowStatusResponse {
  is_following: boolean;
  followers_count: number;
  following_count: number;
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
  async createUser(userData: {
    wallet_address?: string;
    email?: string;
    username: string;
    display_name?: string;
    bio?: string;
    avatar_url?: string;
  }): Promise<ApiResponse<User>> {
    return this.request<User>('/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  async getUser(userId: string): Promise<ApiResponse<User>> {
    return this.request<User>(`/users/${userId}`);
  }

  async updateUserProfile(userId: string, profileData: {
    display_name?: string;
    bio?: string;
    avatar_url?: string;
  }): Promise<ApiResponse<User>> {
    return this.request<User>(`/users/${userId}/profile`, {
      method: 'POST',
      body: JSON.stringify(profileData),
    });
  }

  // Post endpoints
  async getPosts(limit = 20, offset = 0): Promise<ApiResponse<PostWithAuthor[]>> {
    return this.request<PostWithAuthor[]>(`/posts?limit=${limit}&offset=${offset}`);
  }

  async createPost(postData: {
    author_id: string;
    content: string;
    media_urls?: string[];
  }): Promise<ApiResponse<Post>> {
    return this.request<Post>('/posts', {
      method: 'POST',
      body: JSON.stringify(postData),
    });
  }

  async likePost(postId: string, userId: string): Promise<ApiResponse<boolean>> {
    return this.request<boolean>(`/posts/${postId}/like`, {
      method: 'POST',
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
    for (let [key, value] of formData.entries()) {
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
