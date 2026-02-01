export type FeedTone = 'light' | 'dark';

export interface FeedAuthor {
  id?: string;
  username: string;
  displayName?: string;
  avatarUrl?: string | null;
  bio?: string | null;
  tokenSymbol?: string;
  walletAddress?: string;
  followersCount?: number;
  holdersCount?: number;
  followingCount?: number;
}

export interface FeedMediaItem {
  type: 'image' | 'video';
  url: string;
}

export interface FeedPostItem {
  id: string;
  author: FeedAuthor;
  content: string;
  timestamp: string;
  media?: FeedMediaItem[];
  likesCount?: number;
  commentsCount?: number;
}
