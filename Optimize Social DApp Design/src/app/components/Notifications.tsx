import { useState } from 'react';

interface NotificationProps {
  onClose: () => void;
}

type NotificationType = 'like' | 'comment' | 'follow' | 'share_price';

interface Notification {
  id: string;
  type: NotificationType;
  user: string;
  content: string;
  timestamp: string;
  read: boolean;
}

const mockNotifications: Notification[] = [
  {
    id: '1',
    type: 'like',
    user: '0x9f...2a3b',
    content: 'liked your post',
    timestamp: '2m ago',
    read: false,
  },
  {
    id: '2',
    type: 'follow',
    user: '0x4c...8d9e',
    content: 'started following you',
    timestamp: '15m ago',
    read: false,
  },
  {
    id: '3',
    type: 'comment',
    user: '0x7b...3f1c',
    content: 'commented on your post',
    timestamp: '1h ago',
    read: false,
  },
  {
    id: '4',
    type: 'share_price',
    user: '0x2e...5a7d',
    content: 'bought your shares',
    timestamp: '2h ago',
    read: true,
  },
  {
    id: '5',
    type: 'like',
    user: '0x2e...5a7d',
    content: 'liked your post',
    timestamp: '3h ago',
    read: true,
  },
  {
    id: '6',
    type: 'follow',
    user: '0x8a...9c4b',
    content: 'started following you',
    timestamp: '5h ago',
    read: true,
  },
  {
    id: '7',
    type: 'comment',
    user: '0x1d...6e2f',
    content: 'commented on your post',
    timestamp: '1d ago',
    read: true,
  },
  {
    id: '8',
    type: 'like',
    user: '0x5f...4b8c',
    content: 'liked your post',
    timestamp: '1d ago',
    read: true,
  },
  {
    id: '9',
    type: 'follow',
    user: '0x3c...7a9f',
    content: 'started following you',
    timestamp: '2d ago',
    read: true,
  },
  {
    id: '10',
    type: 'share_price',
    user: '0x9e...4b2d',
    content: 'sold your shares',
    timestamp: '2d ago',
    read: true,
  },
];

export function Notifications({ onClose }: NotificationProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={onClose}
            className="text-gray-600 hover:text-gray-900 text-sm"
          >
            ← Back to Feed
          </button>
          <h1 className="text-lg tracking-tight text-gray-900">Notifications</h1>
          <div className="w-20" /> {/* Spacer for centering */}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-3">
        {mockNotifications.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-12 text-center">
            <p className="text-gray-500 text-sm">No notifications yet</p>
          </div>
        ) : (
          mockNotifications.map((notification) => (
            <div
              key={notification.id}
              className={`bg-white rounded-lg shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow ${
                !notification.read ? 'bg-gray-50' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 flex-shrink-0" />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-sm text-gray-900">
                      {notification.user}
                    </span>
                    <span className="text-sm text-gray-600">{notification.content}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{notification.timestamp}</p>
                </div>
              </div>
            </div>
          ))
        )}

        {mockNotifications.length > 0 && (
          <div className="text-center py-4">
            <p className="text-xs text-gray-400">You're all caught up!</p>
          </div>
        )}
      </main>
    </div>
  );
}