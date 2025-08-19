import React, { useState, useEffect } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Bell, X, Heart, MessageCircle, TrendingUp, Users } from 'lucide-react';
import { apiService, type Notification } from '../lib/api';

interface NotificationsProps {
  user: any;
  onClose: () => void;
}

export const Notifications: React.FC<NotificationsProps> = ({ user, onClose }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.id) {
      fetchNotifications();
    }
  }, [user]);

  const fetchNotifications = async () => {
    if (!user?.id) return;
    
    try {
      setLoading(true);
      const response = await apiService.getUserNotifications(user.id);
      
      if (response.success && response.data) {
        setNotifications(response.data);
      } else {
        console.error('Failed to fetch notifications:', response.error);
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationId: string) => {
    try {
      const response = await apiService.markNotificationRead(notificationId);
      
      if (response.success) {
        setNotifications(notifications.map(notif => 
          notif.id === notificationId ? { ...notif, is_read: true } : notif
        ));
      }
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      // Mark all unread notifications as read
      const unreadNotifications = notifications.filter(n => !n.is_read);
      
      for (const notification of unreadNotifications) {
        await apiService.markNotificationRead(notification.id);
      }
      
      setNotifications(notifications.map(notif => ({ ...notif, is_read: true })));
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
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
        return <Heart className="w-5 h-5 text-pink-600" />;
      case 'comment':
        return <MessageCircle className="w-5 h-5 text-blue-600" />;
      case 'token_update':
        return <TrendingUp className="w-5 h-5 text-green-600" />;
      case 'follow':
        return <Users className="w-5 h-5 text-purple-600" />;
      case 'mention':
        return <Bell className="w-5 h-5 text-yellow-600" />;
      default:
        return <Bell className="w-5 h-5 text-gray-500" />;
    }
  };

  const filteredNotifications = filter === 'all' 
    ? notifications 
    : notifications.filter(notif => notif.notification_type === filter);

  const unreadCount = notifications.filter(notif => !notif.is_read).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center">
          <Bell className="w-6 h-6 mr-2 text-blue-600" />
          Notifications
          {unreadCount > 0 && (
            <span className="ml-2 px-2 py-1 text-xs bg-blue-500 text-white rounded-full">
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
              className="text-blue-600 hover:text-blue-700"
            >
              Mark all read
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
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
          className={`whitespace-nowrap ${
            filter === 'all' 
              ? 'bg-blue-500 text-white' 
              : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          All ({notifications.length})
        </Button>
        <Button
          variant={filter === 'like' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => filterNotifications('like')}
          className={`whitespace-nowrap ${
            filter === 'like' 
              ? 'bg-pink-500 text-white' 
              : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          <Heart className="w-4 h-4 mr-1" />
          Likes
        </Button>
        <Button
          variant={filter === 'comment' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => filterNotifications('comment')}
          className={`whitespace-nowrap ${
            filter === 'comment' 
              ? 'bg-blue-500 text-white' 
              : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          <MessageCircle className="w-4 h-4 mr-1" />
          Comments
        </Button>
        <Button
          variant={filter === 'token' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => filterNotifications('token')}
          className={`whitespace-nowrap ${
            filter === 'token' 
              ? 'bg-green-500 text-white' 
              : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          <TrendingUp className="w-4 h-4 mr-1" />
          Tokens
        </Button>
        <Button
          variant={filter === 'follow' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => filterNotifications('follow')}
          className={`whitespace-nowrap ${
            filter === 'follow' 
              ? 'bg-purple-500 text-white' 
              : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          <Users className="w-4 h-4 mr-1" />
          Follows
        </Button>
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {loading ? (
          <Card className="bg-white border border-[#ECECEC] p-12 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-600">Loading notifications...</p>
          </Card>
        ) : filteredNotifications.length > 0 ? (
          filteredNotifications.map((notification) => (
            <Card 
              key={notification.id} 
              className={`border p-4 cursor-pointer transition-all duration-300 ${
                notification.is_read 
                  ? 'bg-white border-[#ECECEC] hover:border-gray-300' 
                  : 'bg-blue-50 border-blue-200 hover:border-blue-300'
              }`}
              onClick={() => markAsRead(notification.id)}
            >
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 pt-1">
                  {getNotificationIcon(notification.notification_type)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className={`text-sm font-semibold ${
                        notification.is_read ? 'text-gray-600' : 'text-gray-900'
                      }`}>
                        {notification.title}
                      </h4>
                      <p className={`text-sm leading-relaxed mt-1 ${
                        notification.is_read ? 'text-gray-500' : 'text-gray-700'
                      }`}>
                        {notification.content}
                      </p>
                    </div>
                    
                    <div className="flex items-center space-x-2 ml-4">
                      <span className="text-xs text-gray-500 whitespace-nowrap">
                        {formatTimeAgo(notification.created_at)}
                      </span>
                      {!notification.is_read && (
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))
        ) : (
          <Card className="bg-white border border-[#ECECEC] p-12 text-center">
            <Bell className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-700 mb-2">
              {filter === 'all' ? 'No notifications yet' : `No ${filter} notifications`}
            </h3>
            <p className="text-gray-600">
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
        <Card className="bg-white border border-[#ECECEC] p-4">
          <div className="flex items-center justify-between">
            <div className="text-gray-600 text-sm">
              Stay updated with the latest activity on your profile and tokens
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-gray-500 hover:text-gray-700"
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