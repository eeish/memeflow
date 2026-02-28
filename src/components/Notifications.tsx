import React, { useEffect, useState } from 'react';
import { ArrowLeft } from './ui-simple/Icons';
import { apiService, type Notification } from '../lib/api';
import { formatTimeAgo } from '../lib/feed';

interface NotificationsProps {
  user: any;
  onClose: () => void;
  onOpenPost?: (postId: string) => void;
}

/** Derive context label from notification type */
function contextLabel(type: string): string | null {
  if (type === 'comment') return 'On your post';
  if (type === 'reply') return 'On your comment';
  return null;
}

/** Derive the short action verb from notification type */
function actionVerb(type: string): string {
  if (type === 'reply') return 'replied';
  if (type === 'comment') return 'commented';
  return '';
}

/**
 * Extract actor username from a notification.
 * Prefers the explicit `actor_username` field (populated via JOIN for new
 * notifications).  Falls back to parsing the leading `@username` from the
 * `content` string for older notifications that lack `actor_id`.
 */
function getActorUsername(n: Notification): string {
  if (n.actor_username) return n.actor_username;
  const match = n.content.match(/^@(\S+)/);
  return match ? match[1] : '?';
}

/**
 * Get the "action text" portion of the content — everything after the leading
 * `@username ` prefix.  e.g. "commented on your post".
 */
function getActionText(n: Notification): string {
  return n.content.replace(/^@\S+\s*/, '');
}

/** Avatar component: renders image or gradient fallback */
function Avatar({ url, size = 40 }: { url?: string | null; size?: number }) {
  const cls = `rounded-full object-cover flex-shrink-0`;
  if (url) {
    return <img src={url} alt="" className={cls} style={{ width: size, height: size }} />;
  }
  return (
    <div
      className={`rounded-full bg-gradient-to-br from-gray-300 to-gray-400 flex-shrink-0`}
      style={{ width: size, height: size }}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Collapsed card (Phase 1)                                          */
/* ------------------------------------------------------------------ */
function CollapsedCard({
  notification,
  onClick,
}: {
  notification: Notification;
  onClick: () => void;
}) {
  const ctx = contextLabel(notification.notification_type);
  const username = getActorUsername(notification);
  const action = getActionText(notification);

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl border border-gray-200 px-4 py-3 cursor-pointer hover:border-gray-300 transition-colors"
    >
      <div className="flex items-start gap-3">
        <Avatar url={notification.actor_avatar_url} size={40} />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-900 leading-snug">
            <span className="font-semibold">@{username}</span>
            {' '}{action}
          </p>
          {ctx && <p className="text-xs text-gray-400 mt-0.5">{ctx}</p>}
        </div>
        <span className="text-xs text-gray-400 flex-shrink-0 pt-0.5">
          {formatTimeAgo(notification.created_at)}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Expanded card (Phase 2)                                           */
/* ------------------------------------------------------------------ */
function ExpandedCard({
  notification,
  onOpenPost,
  onDismiss,
}: {
  notification: Notification;
  onOpenPost?: () => void;
  onDismiss: () => void;
}) {
  const ctx = contextLabel(notification.notification_type);
  const username = getActorUsername(notification);
  const verb = actionVerb(notification.notification_type);
  const timeAgo = formatTimeAgo(notification.created_at);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      {/* Header: avatar + action + timestamp */}
      <div className="flex items-start gap-3">
        <Avatar url={notification.actor_avatar_url} size={44} />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-900 font-semibold leading-snug">
            @{username} {verb}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{timeAgo} ago</p>
        </div>
        <span className="text-xs text-gray-400 flex-shrink-0 pt-0.5">
          {timeAgo}
        </span>
      </div>

      {/* Detail: the actual comment / reply text */}
      {notification.detail && (
        <p className="mt-4 text-lg text-gray-900 leading-snug">
          {notification.detail}
        </p>
      )}

      {/* Context label */}
      {ctx && <p className="mt-4 text-sm text-gray-500">{ctx}</p>}

      {/* Actions */}
      <div className="mt-4 flex items-center justify-center gap-3">
        {notification.related_id && onOpenPost && (
          <button
            onClick={(e) => { e.stopPropagation(); onOpenPost(); }}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Open post
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          className="px-5 py-2 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Notifications page                                           */
/* ------------------------------------------------------------------ */
export function Notifications({ user, onClose, onOpenPost }: NotificationsProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!user?.id) { setNotifications([]); return; }
      setLoading(true);
      setError('');
      try {
        const res = await apiService.getUserNotifications(user.id);
        if (res.success && res.data) setNotifications(res.data);
        else setError(res.error || 'Failed to load notifications');
      } catch {
        setError('Failed to load notifications');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.id]);

  const unreadCount = notifications.filter(n => n.status !== 'read').length;

  /** Expand a notification and mark it read */
  const handleExpand = async (n: Notification) => {
    const opening = expandedId !== n.id;
    setExpandedId(opening ? n.id : null);

    if (opening && n.status !== 'read') {
      try {
        await apiService.markNotificationRead(n.id);
        setNotifications(prev =>
          prev.map(x => x.id === n.id ? { ...x, status: 'read' as const } : x),
        );
      } catch { /* silently fail */ }
    }
  };

  const handleMarkAllRead = async () => {
    if (!user?.id || unreadCount === 0) return;
    try {
      await apiService.markAllNotificationsRead(user.id);
      setNotifications(prev => prev.map(n => ({ ...n, status: 'read' as const })));
    } catch { /* silently fail */ }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ---- Header ---- */}
      <header className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>

          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight text-gray-900">
              Notifications
            </h1>
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-xs font-medium px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
                {unreadCount}
              </span>
            )}
          </div>

          {unreadCount > 0 ? (
            <button
              onClick={handleMarkAllRead}
              className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
            >
              Mark all read
            </button>
          ) : (
            <div className="w-[5.5rem]" />
          )}
        </div>
      </header>

      {/* ---- Body ---- */}
      <main className="max-w-2xl mx-auto px-4 py-4 space-y-3">
        {loading ? (
          <div className="p-12 text-center">
            <p className="text-gray-500 text-sm">Loading notifications...</p>
          </div>
        ) : error ? (
          <div className="p-12 text-center">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-500 text-sm">No notifications yet</p>
          </div>
        ) : (
          notifications.map((n) =>
            expandedId === n.id ? (
              <ExpandedCard
                key={n.id}
                notification={n}
                onOpenPost={
                  n.related_id && onOpenPost
                    ? () => onOpenPost(n.related_id!)
                    : undefined
                }
                onDismiss={() => setExpandedId(null)}
              />
            ) : (
              <CollapsedCard
                key={n.id}
                notification={n}
                onClick={() => handleExpand(n)}
              />
            ),
          )
        )}

        {notifications.length > 0 && !loading && !error && (
          <div className="text-center py-4">
            <p className="text-xs text-gray-400">You're all caught up!</p>
          </div>
        )}
      </main>
    </div>
  );
}
