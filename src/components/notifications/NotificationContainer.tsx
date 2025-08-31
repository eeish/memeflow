import React, { useEffect } from 'react';
import { useNotifications, setGlobalNotificationContext } from '../../contexts/NotificationContext';
import { ToastNotification } from './ToastNotification';
import { InlineNotification } from './InlineNotification';
import { BannerNotification } from './BannerNotification';
import { Settings } from 'lucide-react';
import { cn } from '../../lib/utils';

export const NotificationContainer: React.FC = () => {
  const notifications = useNotifications();

  // Set global context for external access
  useEffect(() => {
    setGlobalNotificationContext(notifications);
  }, [notifications]);

  // Filter notifications by display type
  const toasts = notifications.notifications.filter(n => n.display === 'toast');
  const banners = notifications.notifications.filter(n => n.display === 'banner');

  return (
    <>
      {/* Toast notifications container */}
      <div className="fixed top-4 right-4 z-50 space-y-3 pointer-events-none">
        {toasts.map(notification => (
          <div key={notification.id} className="pointer-events-auto">
            <ToastNotification
              notification={notification}
              onDismiss={notifications.dismiss}
            />
          </div>
        ))}
      </div>

      {/* Banner notifications */}
      {banners.map(notification => (
        <BannerNotification
          key={notification.id}
          notification={notification}
          onDismiss={notifications.dismiss}
          position="top"
        />
      ))}

      {/* Debug Mode Toggle (floating button) */}
      <DebugModeToggle />
    </>
  );
};

const DebugModeToggle: React.FC = () => {
  const { debugMode, setDebugMode } = useNotifications();
  const [isOpen, setIsOpen] = React.useState(false);

  // Only show the button when debug mode is enabled
  if (!debugMode) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="relative">
        {/* Toggle button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'p-3 rounded-full shadow-lg transition-all duration-200',
            'hover:scale-105 active:scale-95',
            'bg-purple-600 text-white hover:bg-purple-700'
          )}
          title="Debug Settings"
        >
          <Settings className="w-5 h-5" />
        </button>

        {/* Debug panel - positioned to the left of the button */}
        {isOpen && (
          <div className="absolute bottom-14 right-0 w-64 bg-white rounded-lg shadow-xl border border-gray-200 p-4 animate-in slide-in-from-bottom">
            <h3 className="font-semibold text-sm text-gray-900 mb-3">Debug Settings</h3>
            
            <div className="space-y-3">
              {/* Debug mode toggle */}
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-gray-700">Debug Mode</span>
                <button
                  onClick={() => setDebugMode(!debugMode)}
                  className={cn(
                    'relative w-11 h-6 rounded-full transition-colors duration-200',
                    debugMode ? 'bg-purple-600' : 'bg-gray-300'
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full',
                      'transition-transform duration-200',
                      debugMode ? 'translate-x-5' : 'translate-x-0'
                    )}
                  />
                </button>
              </label>

              <div className="text-xs text-gray-500 space-y-1">
                <p>• Debug messages shown</p>
                <p>• Console logging active</p>
                <p>• Use <code className="bg-gray-100 px-1 rounded">disableDebug()</code> to hide</p>
              </div>

              {/* Quick actions */}
              <div className="pt-3 border-t border-gray-200 space-y-2">
                <button
                  onClick={() => {
                    console.log('Current notifications:', notifications.notifications);
                    notifications.debug('Debug mode test message', {
                      metadata: { timestamp: new Date().toISOString() }
                    });
                  }}
                  className="w-full px-3 py-1.5 text-xs font-medium text-purple-600 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
                >
                  Send Test Debug Message
                </button>
                
                <button
                  onClick={() => {
                    setDebugMode(false);
                    setIsOpen(false);
                  }}
                  className="w-full px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  Hide Debug Button
                </button>
              </div>

              {/* Console hint */}
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs text-gray-400">
                  💡 Console commands available:
                </p>
                <div className="mt-1 text-xs font-mono text-gray-500 space-y-0.5">
                  <p>• enableDebug()</p>
                  <p>• disableDebug()</p>
                  <p>• toggleDebug()</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Export inline notification for embedding
export { InlineNotification };