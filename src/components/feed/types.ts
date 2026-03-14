export type FeedTone = 'light' | 'dark';

export interface FeedAuthor {
  id?: string;
  username: string;
  avatarUrl?: string | null;
  bio?: string | null;
  tokenSymbol?: string;
  walletAddress?: string;
  followersCount?: number;
  holdersCount?: number;
  followingCount?: number;
  isGraduated?: boolean;
  tokenName?: string;
}

export interface FeedMediaItem {
  type: 'image' | 'video';
  url: string;
}

export interface FeedPostItem {
  id: string;
  author: FeedAuthor;
  content: string;
  /** Pre-formatted display string, e.g. "2h" */
  timestamp: string;
  /** Raw ISO-8601 from backend — used for trending score calculation */
  createdAt?: string;
  media?: FeedMediaItem[];
  likesCount?: number;
  commentsCount?: number;
}
