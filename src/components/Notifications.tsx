import React, { useState, useEffect } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Bell, X, Heart, MessageCircle, TrendingUp, Users } from 'lucide-react';

interface NotificationsProps {
  user: any;
  onClose: () => void;
}

export const Notifications: React.FC<NotificationsProps> = ({ onClose }) => {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      // Mock notifications data - replace with real API
      const mockNotifications = [
        {
          id: '1',
          type: 'like',
          message: 'cryptokid liked your post about token launches',
          read: false,
          createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(), // 30 mins ago
          avatar: null,
          username: 'cryptokid'
        },
        {
          id: '2',
          type: 'comment',
          message: 'moonlambo commented on your post: "Great analysis! 🚀"',
          read: false,
          createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
          avatar: null,
          username: 'moonlambo'
        },
        {
          id: '3',
          type: 'token',
          message: 'Your token $MEME gained 50 new holders today!',
          read: true,
          createdAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(), // 6 hours ago
        },
        {
          id: '4',
          type: 'follow',
          message: 'memequeen started following you',
          read: true,
          createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // 1 day ago
          avatar: null,
          username: 'memequeen'
        },
        {
          id: '5',
          type: 'token',
          message: 'Your token $MEME reached a new all-time high of $0.0015!',
          read: true,
          createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(), // 2 days ago
        },
        {
          id: '6',
          type: 'like',
          message: 'pepemaster and 12 others liked your post',
          read: true,
          createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(), // 3 days ago
          avatar: null,
          username: 'pepemaster'
        }
      ];

      setNotifications(mockNotifications);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    }
  };

  const markAsRead = (notificationId: string) => {
    setNotifications(notifications.map(notif => 
      notif.id === notificationId ? { ...notif, read: true } : notif
    ));
  };

  const markAllAsRead = () => {
    setNotifications(notifications.map(notif => ({ ...notif, read: true })));
  };

  const filterNotifications = (type: string) => {
    setFilter(type);
  };

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 60) {
      return `${diffInMinutes}m`;
    } else if (diffInMinutes < 1440) {
      return `${Math.floor(diffInMinutes / 60)}h`;
    } else {
      return `${Math.floor(diffInMinutes / 1440)}d`;
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'like':
        return <Heart className="w-5 h-5 text-pink-400" />;
      case 'comment':
        return <MessageCircle className="w-5 h-5 text-cyan-400" />;
      case 'token':
        return <TrendingUp className="w-5 h-5 text-green-400" />;
      case 'follow':
        return <Users className="w-5 h-5 text-purple-400" />;
      default:
        return <Bell className="w-5 h-5 text-white/50" />;
    }
  };

  const filteredNotifications = filter === 'all' 
    ? notifications 
    : notifications.filter(notif => notif.type === filter);

  const unreadCount = notifications.filter(notif => !notif.read).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-transparent bg-gradient-to-r from-cyan-400 via-pink-400 to-purple-400 bg-clip-text flex items-center">
          <Bell className="w-6 h-6 mr-2" />
          Notifications
          {unreadCount > 0 && (
            <span className="ml-2 px-2 py-1 text-xs bg-pink-500 text-white rounded-full">
              {unreadCount}
            </span>
          )}
        </h2>
        <div className="flex items-center space-x-2">
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllAsRead}
              className="text-cyan-400 hover:text-cyan-300"
            >
              Mark all read
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-white/60 hover:text-white"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center space-x-2 overflow-x-auto">
        <Button
          variant={filter === 'all' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => filterNotifications('all')}
          className="text-white whitespace-nowrap"
        >
          All ({notifications.length})
        </Button>
        <Button
          variant={filter === 'like' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => filterNotifications('like')}
          className="text-white whitespace-nowrap"
        >
          <Heart className="w-4 h-4 mr-1" />
          Likes
        </Button>
        <Button
          variant={filter === 'comment' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => filterNotifications('comment')}
          className="text-white whitespace-nowrap"
        >
          <MessageCircle className="w-4 h-4 mr-1" />
          Comments
        </Button>
        <Button
          variant={filter === 'token' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => filterNotifications('token')}
          className="text-white whitespace-nowrap"
        >
          <TrendingUp className="w-4 h-4 mr-1" />
          Tokens
        </Button>
        <Button
          variant={filter === 'follow' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => filterNotifications('follow')}
          className="text-white whitespace-nowrap"
        >
          <Users className="w-4 h-4 mr-1" />
          Follows
        </Button>
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {filteredNotifications.length > 0 ? (
          filteredNotifications.map((notification) => (
            <Card 
              key={notification.id} 
              className={`glass border p-4 cursor-pointer transition-all duration-300 ${
                notification.read 
                  ? 'border-white/10 hover:border-white/20' 
                  : 'border-cyan-400/30 bg-cyan-500/10 hover:border-cyan-400/50'
              }`}
              onClick={() => markAsRead(notification.id)}
            >
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 pt-1">
                  {getNotificationIcon(notification.type)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <p className={`text-sm leading-relaxed ${
                      notification.read ? 'text-white/70' : 'text-white'
                    }`}>
                      {notification.message}
                    </p>
                    
                    <div className="flex items-center space-x-2 ml-4">
                      <span className="text-xs text-white/50 whitespace-nowrap">
                        {formatTimeAgo(notification.createdAt)}
                      </span>
                      {!notification.read && (
                        <div className="w-2 h-2 bg-cyan-400 rounded-full"></div>
                      )}
                    </div>
                  </div>
                  
                  {notification.username && (
                    <div className="flex items-center mt-2">
                      <div className="w-6 h-6 bg-gradient-to-r from-cyan-400 to-purple-400 rounded-full flex items-center justify-center mr-2">
                        <span className="text-white font-bold text-xs">
                          {notification.username[0].toUpperCase()}
                        </span>
                      </div>
                      <span className="text-xs text-cyan-400">@{notification.username}</span>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))
        ) : (
          <Card className="glass border border-white/10 p-12 text-center">
            <Bell className="w-16 h-16 text-white/30 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white/70 mb-2">
              {filter === 'all' ? 'No notifications yet' : `No ${filter} notifications`}
            </h3>
            <p className="text-white/50">
              {filter === 'all' 
                ? "You'll see notifications about likes, comments, and token activity here"
                : `You don't have any ${filter} notifications yet`
              }
            </p>
          </Card>
        )}
      </div>

      {/* Quick Actions */}
      {notifications.length > 0 && (
        <Card className="glass border border-white/10 p-4">
          <div className="flex items-center justify-between">
            <div className="text-white/70 text-sm">
              Stay updated with the latest activity on your profile and tokens
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-white/60 hover:text-white"
              >
                Settings
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};