import { useState, useEffect, useCallback, useRef } from 'react';
import { apiService } from '../lib/api';
import type { PostWithAuthor } from '../lib/api';
import type { FeedPostItem } from '../components/feed/types';
import { formatTimeAgo, inferMediaType } from '../lib/feed';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Posts fetched per page for Latest/Following tabs. */
const PAGE_SIZE = 20;
/** Larger initial pool for Trending so the scorer has enough candidates. */
const TRENDING_POOL = 60;
/** Background poll interval (ms). */
const POLL_MS = 30_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function convertPost(p: PostWithAuthor): FeedPostItem {
  const mediaUrls = Array.isArray(p.media_urls) ? p.media_urls : [];
  return {
    id: p.id,
    author: {
      id: p.author_id,
      username: p.author.username,
      avatarUrl: p.author.avatar_url,
      bio: p.author.bio,
      tokenSymbol: p.author.token_symbol,
      walletAddress: p.author.wallet_address,
      followersCount: p.author.followers_count,
      holdersCount: p.author.followers_count,
    },
    content: p.content,
    timestamp: formatTimeAgo(p.created_at),
    createdAt: p.created_at,
    likesCount: p.likes_count ?? 0,
    commentsCount: p.comments_count ?? 0,
    media: mediaUrls.map((url) => ({ type: inferMediaType(url), url })),
  };
}

/**
 * Hacker News–style gravity score.
 * Higher engagement + newer post → higher rank.
 */
function trendingScore(post: FeedPostItem): number {
  const ageMs = post.createdAt
    ? Date.now() - new Date(post.createdAt).getTime()
    : 0;
  const ageHours = ageMs / 3_600_000;
  const interactions = (post.likesCount ?? 0) + (post.commentsCount ?? 0) * 1.5;
  return interactions / Math.pow(ageHours + 2, 1.8);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type FeedTab = 'trending' | 'following';

export interface UseFeedReturn {
  posts: FeedPostItem[];
  isLoading: boolean;
  isFetchingMore: boolean;
  hasMore: boolean;
  /** Number of new posts detected by background poll not yet shown to user. */
  newCount: number;
  error: string | null;
  loadMore: () => void;
  refresh: () => void;
  prependPost: (post: FeedPostItem) => void;
  removePost: (postId: string) => void;
  updateCommentCount: (postId: string, count: number) => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFeed(tab: FeedTab): UseFeedReturn {
  const [posts, setPosts] = useState<FeedPostItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [newCount, setNewCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Refs for reading mutable values inside async callbacks and stable callbacks
  // without triggering dependency re-runs or stale closures.
  const postsRef = useRef<FeedPostItem[]>([]);
  const offsetRef = useRef(0);
  const hasMoreRef = useRef(true);
  const isFetchingMoreRef = useRef(false);
  const isLoadingRef = useRef(true);
  // Newest ISO timestamp seen — used by the poll to count genuinely new posts.
  const newestCreatedAtRef = useRef<string | null>(null);

  // Keep refs in sync with state.
  const syncRefs = useCallback(
    (next: FeedPostItem[], more: boolean) => {
      postsRef.current = next;
      hasMoreRef.current = more;
    },
    [],
  );

  // ── Initial load + tab-change reset ─────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      isLoadingRef.current = true;
      setIsFetchingMore(false);
      isFetchingMoreRef.current = false;
      setPosts([]);
      postsRef.current = [];
      offsetRef.current = 0;
      setHasMore(true);
      hasMoreRef.current = true;
      setNewCount(0);
      setError(null);

      try {
        const poolSize = tab === 'trending' ? TRENDING_POOL : PAGE_SIZE;
        const resp = await apiService.getPlazaPosts(poolSize, 0);
        if (cancelled) return;

        if (resp.success && resp.data) {
          let converted = resp.data.map(convertPost);
          if (tab === 'trending') {
            converted = converted
              .sort((a, b) => trendingScore(b) - trendingScore(a))
              .slice(0, PAGE_SIZE);
          }

          const hasMore = resp.data.length >= poolSize;
          setPosts(converted);
          syncRefs(converted, hasMore);
          offsetRef.current = resp.data.length;
          setHasMore(hasMore);
          newestCreatedAtRef.current = resp.data[0]?.created_at ?? null;
        } else {
          setHasMore(false);
          hasMoreRef.current = false;
        }
      } catch {
        if (!cancelled) setError('Failed to load posts. Please try again.');
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          isLoadingRef.current = false;
        }
      }
    };

    load();
    return () => { cancelled = true; };
  }, [tab, syncRefs]);

  // ── Background poll ──────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      if (isLoadingRef.current) return;
      try {
        const resp = await apiService.getPlazaPosts(PAGE_SIZE, 0);
        if (cancelled || !resp.success || !resp.data) return;

        const existingIds = new Set(postsRef.current.map((p) => p.id));
        const brandNew = resp.data.filter((p) => !existingIds.has(p.id));
        if (brandNew.length > 0) {
          setNewCount((c) => c + brandNew.length);
        }
      } catch {
        // Polling errors are silent — they'll retry next interval.
      }
    };

    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [tab]);

  // ── Pagination ───────────────────────────────────────────────────────────────

  const loadMore = useCallback(() => {
    if (isFetchingMoreRef.current || isLoadingRef.current || !hasMoreRef.current) return;

    isFetchingMoreRef.current = true;
    setIsFetchingMore(true);

    const poolSize = tab === 'trending' ? TRENDING_POOL : PAGE_SIZE;
    const currentOffset = offsetRef.current;

    apiService.getPlazaPosts(poolSize, currentOffset).then((resp) => {
      if (!resp.success || !resp.data) {
        setHasMore(false);
        hasMoreRef.current = false;
        return;
      }

      const existingIds = new Set(postsRef.current.map((p) => p.id));
      const fresh = resp.data.filter((p) => !existingIds.has(p.id));
      let converted = fresh.map(convertPost);

      // For trending: sort each new batch among themselves to preserve the
      // already-displayed order (visible posts never jump position).
      if (tab === 'trending') {
        converted = converted.sort((a, b) => trendingScore(b) - trendingScore(a));
      }

      const hasMore = resp.data.length >= poolSize;
      const next = [...postsRef.current, ...converted];

      setPosts(next);
      syncRefs(next, hasMore);
      offsetRef.current = currentOffset + resp.data.length;
      setHasMore(hasMore);
      hasMoreRef.current = hasMore;
    }).catch(() => {
      // Keep hasMore as-is so the user can retry by scrolling again.
    }).finally(() => {
      isFetchingMoreRef.current = false;
      setIsFetchingMore(false);
    });
  }, [tab, syncRefs]);

  // ── Refresh (called when user taps "N new posts" pill) ───────────────────────

  const refresh = useCallback(() => {
    setNewCount(0);
    // Trigger a full reload by advancing a counter — we reuse the initial
    // load useEffect by driving it from `tab`. Since `tab` hasn't changed,
    // we need to imperatively re-run load logic here.
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      isLoadingRef.current = true;
      setIsFetchingMore(false);
      isFetchingMoreRef.current = false;
      setPosts([]);
      postsRef.current = [];
      offsetRef.current = 0;
      setHasMore(true);
      hasMoreRef.current = true;
      setError(null);

      try {
        const poolSize = tab === 'trending' ? TRENDING_POOL : PAGE_SIZE;
        const resp = await apiService.getPlazaPosts(poolSize, 0);
        if (cancelled) return;

        if (resp.success && resp.data) {
          let converted = resp.data.map(convertPost);
          if (tab === 'trending') {
            converted = converted
              .sort((a, b) => trendingScore(b) - trendingScore(a))
              .slice(0, PAGE_SIZE);
          }

          const hasMore = resp.data.length >= poolSize;
          setPosts(converted);
          syncRefs(converted, hasMore);
          offsetRef.current = resp.data.length;
          setHasMore(hasMore);
          newestCreatedAtRef.current = resp.data[0]?.created_at ?? null;
        }
      } catch {
        if (!cancelled) setError('Failed to refresh feed.');
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          isLoadingRef.current = false;
        }
      }
    };

    load();
    return () => { cancelled = true; };
  }, [tab, syncRefs]);

  // ── Optimistic mutations ─────────────────────────────────────────────────────

  const prependPost = useCallback((post: FeedPostItem) => {
    setPosts((prev) => {
      const next = [post, ...prev];
      postsRef.current = next;
      return next;
    });
    // Advance the offset so the next loadMore doesn't re-fetch this post's slot.
    offsetRef.current += 1;
  }, []);

  const removePost = useCallback((postId: string) => {
    setPosts((prev) => {
      const next = prev.filter((p) => p.id !== postId);
      postsRef.current = next;
      return next;
    });
  }, []);

  const updateCommentCount = useCallback((postId: string, count: number) => {
    setPosts((prev) => {
      const next = prev.map((p) =>
        p.id === postId ? { ...p, commentsCount: count } : p,
      );
      postsRef.current = next;
      return next;
    });
  }, []);

  return {
    posts,
    isLoading,
    isFetchingMore,
    hasMore,
    newCount,
    error,
    loadMore,
    refresh,
    prependPost,
    removePost,
    updateCommentCount,
  };
}
