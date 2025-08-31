import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

// Simple ID generator
const generateId = () => {
  return `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Notification types
export type NotificationType = 'error' | 'warning' | 'success' | 'info' | 'debug';
export type NotificationDisplay = 'toast' | 'inline' | 'banner';
export type NotificationCategory = 'network' | 'transaction' | 'auth' | 'general' | 'debug-info';

export interface NotificationMessage {
  id: string;
  type: NotificationType;
  title?: string;
  message: string;
  display: NotificationDisplay;
  category?: NotificationCategory;
  duration?: number; // in milliseconds, 0 for permanent
  timestamp: Date;
  actions?: NotificationAction[];
  metadata?: Record<string, any>;
  dismissible?: boolean;
}

export interface NotificationAction {
  label: string;
  action: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
}

export interface NotificationOptions {
  type: NotificationType;
  title?: string;
  message: string;
  display?: NotificationDisplay;
  category?: NotificationCategory;
  duration?: number;
  actions?: NotificationAction[];
  metadata?: Record<string, any>;
  dismissible?: boolean;
}

export interface NotificationContextType {
  notifications: NotificationMessage[];
  debugMode: boolean;
  setDebugMode: (enabled: boolean) => void;
  show: (options: NotificationOptions) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
  error: (message: string, options?: Partial<NotificationOptions>) => string;
  warning: (message: string, options?: Partial<NotificationOptions>) => string;
  success: (message: string, options?: Partial<NotificationOptions>) => string;
  info: (message: string, options?: Partial<NotificationOptions>) => string;
  debug: (message: string, options?: Partial<NotificationOptions>) => string;
  networkStatus: (message: string, metadata?: Record<string, any>) => string;
  transactionStatus: (message: string, metadata?: Record<string, any>) => string;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const DEFAULT_DURATIONS: Record<NotificationType, number> = {
  error: 0, // Permanent by default for errors
  warning: 8000,
  success: 5000,
  info: 6000,
  debug: 4000,
};

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<NotificationMessage[]>([]);
  const [debugMode, setDebugModeState] = useState<boolean>(() => {
    // Check window.__DEBUG__ or localStorage for debug mode
    return (typeof window !== 'undefined' && window.__DEBUG__) || 
           localStorage.getItem('debugMode') === 'true';
  });

  // Sync debug mode with window.__DEBUG__ and localStorage
  const setDebugMode = useCallback((enabled: boolean) => {
    setDebugModeState(enabled);
    if (typeof window !== 'undefined') {
      window.__DEBUG__ = enabled;
    }
    localStorage.setItem('debugMode', enabled.toString());
  }, []);

  // Core show function
  const show = useCallback((options: NotificationOptions): string => {
    const id = generateId();
    
    // Handle debug messages based on debug mode
    if (options.type === 'debug') {
      console.log('[DEBUG]', options.title || '', options.message, options.metadata || {});
      if (!debugMode) {
        return id; // Only log to console, don't display
      }
    }

    const notification: NotificationMessage = {
      id,
      type: options.type,
      title: options.title,
      message: options.message,
      display: options.display || 'toast',
      category: options.category || 'general',
      duration: options.duration !== undefined ? options.duration : DEFAULT_DURATIONS[options.type],
      timestamp: new Date(),
      actions: options.actions,
      metadata: options.metadata,
      dismissible: options.dismissible !== undefined ? options.dismissible : true,
    };

    setNotifications(prev => [...prev, notification]);

    // Auto-dismiss if duration is set
    if (notification.duration && notification.duration > 0) {
      setTimeout(() => {
        dismiss(id);
      }, notification.duration);
    }

    return id;
  }, [debugMode]);

  // Dismiss a specific notification
  const dismiss = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  // Dismiss all notifications
  const dismissAll = useCallback(() => {
    setNotifications([]);
  }, []);

  // Convenience methods for different types
  const error = useCallback((message: string, options?: Partial<NotificationOptions>): string => {
    return show({ ...options, type: 'error', message });
  }, [show]);

  const warning = useCallback((message: string, options?: Partial<NotificationOptions>): string => {
    return show({ ...options, type: 'warning', message });
  }, [show]);

  const success = useCallback((message: string, options?: Partial<NotificationOptions>): string => {
    return show({ ...options, type: 'success', message });
  }, [show]);

  const info = useCallback((message: string, options?: Partial<NotificationOptions>): string => {
    return show({ ...options, type: 'info', message });
  }, [show]);

  const debug = useCallback((message: string, options?: Partial<NotificationOptions>): string => {
    return show({ ...options, type: 'debug', message, category: 'debug-info' });
  }, [show]);

  // Specialized methods for specific categories
  const networkStatus = useCallback((message: string, metadata?: Record<string, any>): string => {
    return show({
      type: 'info',
      title: 'Network Status',
      message,
      category: 'network',
      metadata,
      display: 'toast',
    });
  }, [show]);

  const transactionStatus = useCallback((message: string, metadata?: Record<string, any>): string => {
    return show({
      type: 'info',
      title: 'Transaction',
      message,
      category: 'transaction',
      metadata,
      display: 'toast',
    });
  }, [show]);

  // Listen for debug mode changes from window
  useEffect(() => {
    const handleDebugChange = () => {
      if (typeof window !== 'undefined' && window.__DEBUG__ !== debugMode) {
        setDebugModeState(window.__DEBUG__);
      }
    };

    window.addEventListener('debugModeChange', handleDebugChange);
    return () => window.removeEventListener('debugModeChange', handleDebugChange);
  }, [debugMode]);

  // Set up console debug functions
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Create console functions for debug control
      (window as any).enableDebug = () => {
        setDebugMode(true);
        console.log('🐛 Debug mode enabled');
        console.log('Debug button is now visible on the right side of the screen');
        return 'Debug mode enabled';
      };

      (window as any).disableDebug = () => {
        setDebugMode(false);
        console.log('Debug mode disabled');
        return 'Debug mode disabled';
      };

      (window as any).toggleDebug = () => {
        const newState = !debugMode;
        setDebugMode(newState);
        console.log(`🐛 Debug mode ${newState ? 'enabled' : 'disabled'}`);
        if (newState) {
          console.log('Debug button is now visible on the right side of the screen');
        }
        return `Debug mode ${newState ? 'enabled' : 'disabled'}`;
      };

      // Log instructions on first load
      if (!localStorage.getItem('debugInstructionsShown')) {
        console.log('%c📢 Debug Controls Available', 'color: #9333ea; font-weight: bold; font-size: 14px');
        console.log('%cUse these commands in the console:', 'color: #6b7280');
        console.log('%c  enableDebug()  %c- Show debug button and enable debug mode', 'color: #3b82f6; font-weight: bold', 'color: #6b7280');
        console.log('%c  disableDebug() %c- Hide debug button and disable debug mode', 'color: #3b82f6; font-weight: bold', 'color: #6b7280');
        console.log('%c  toggleDebug()  %c- Toggle debug mode on/off', 'color: #3b82f6; font-weight: bold', 'color: #6b7280');
        localStorage.setItem('debugInstructionsShown', 'true');
      }
    }

    // Cleanup
    return () => {
      if (typeof window !== 'undefined') {
        delete (window as any).enableDebug;
        delete (window as any).disableDebug;
        delete (window as any).toggleDebug;
      }
    };
  }, [debugMode, setDebugMode]);

  const value: NotificationContextType = {
    notifications,
    debugMode,
    setDebugMode,
    show,
    dismiss,
    dismissAll,
    error,
    warning,
    success,
    info,
    debug,
    networkStatus,
    transactionStatus,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

// Global notification singleton for external access
let globalNotificationContext: NotificationContextType | null = null;

export const setGlobalNotificationContext = (context: NotificationContextType) => {
  globalNotificationContext = context;
  // Make it available globally
  if (typeof window !== 'undefined') {
    (window as any).Notification = context;
  }
};

export const Notification = {
  show: (options: NotificationOptions) => {
    if (globalNotificationContext) {
      return globalNotificationContext.show(options);
    }
    console.warn('Notification system not initialized');
    return '';
  },
  error: (message: string, options?: Partial<NotificationOptions>) => {
    if (globalNotificationContext) {
      return globalNotificationContext.error(message, options);
    }
    console.error(message);
    return '';
  },
  warning: (message: string, options?: Partial<NotificationOptions>) => {
    if (globalNotificationContext) {
      return globalNotificationContext.warning(message, options);
    }
    console.warn(message);
    return '';
  },
  success: (message: string, options?: Partial<NotificationOptions>) => {
    if (globalNotificationContext) {
      return globalNotificationContext.success(message, options);
    }
    console.log(message);
    return '';
  },
  info: (message: string, options?: Partial<NotificationOptions>) => {
    if (globalNotificationContext) {
      return globalNotificationContext.info(message, options);
    }
    console.info(message);
    return '';
  },
  debug: (message: string, options?: Partial<NotificationOptions>) => {
    if (globalNotificationContext) {
      return globalNotificationContext.debug(message, options);
    }
    console.log('[DEBUG]', message);
    return '';
  },
};

// TypeScript declarations for window object
declare global {
  interface Window {
    __DEBUG__: boolean;
    Notification: NotificationContextType;
    enableDebug: () => string;
    disableDebug: () => string;
    toggleDebug: () => string;
  }
}