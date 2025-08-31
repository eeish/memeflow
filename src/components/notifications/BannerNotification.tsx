import React from 'react';
import { X, AlertCircle, CheckCircle, AlertTriangle, Info, Bug, ArrowRight } from 'lucide-react';
import type { NotificationMessage, NotificationType } from '../../contexts/NotificationContext';
import { cn } from '../../lib/utils';

interface BannerNotificationProps {
  notification: NotificationMessage;
  onDismiss?: (id: string) => void;
  position?: 'top' | 'bottom';
}

const typeConfig: Record<NotificationType, {
  icon: React.ReactNode;
  bgGradient: string;
  iconBg: string;
  textColor: string;
  actionColor: string;
}> = {
  error: {
    icon: <AlertCircle className="w-6 h-6" />,
    bgGradient: 'from-red-500 to-red-600',
    iconBg: 'bg-red-600',
    textColor: 'text-white',
    actionColor: 'bg-white/20 hover:bg-white/30 text-white',
  },
  warning: {
    icon: <AlertTriangle className="w-6 h-6" />,
    bgGradient: 'from-amber-500 to-amber-600',
    iconBg: 'bg-amber-600',
    textColor: 'text-white',
    actionColor: 'bg-white/20 hover:bg-white/30 text-white',
  },
  success: {
    icon: <CheckCircle className="w-6 h-6" />,
    bgGradient: 'from-emerald-500 to-emerald-600',
    iconBg: 'bg-emerald-600',
    textColor: 'text-white',
    actionColor: 'bg-white/20 hover:bg-white/30 text-white',
  },
  info: {
    icon: <Info className="w-6 h-6" />,
    bgGradient: 'from-blue-500 to-blue-600',
    iconBg: 'bg-blue-600',
    textColor: 'text-white',
    actionColor: 'bg-white/20 hover:bg-white/30 text-white',
  },
  debug: {
    icon: <Bug className="w-6 h-6" />,
    bgGradient: 'from-purple-500 to-purple-600',
    iconBg: 'bg-purple-600',
    textColor: 'text-white',
    actionColor: 'bg-white/20 hover:bg-white/30 text-white',
  },
};

export const BannerNotification: React.FC<BannerNotificationProps> = ({ 
  notification, 
  onDismiss,
  position = 'top' 
}) => {
  const config = typeConfig[notification.type];

  return (
    <div
      className={cn(
        'fixed left-0 right-0 z-50',
        position === 'top' ? 'top-0' : 'bottom-0',
        'animate-in duration-300',
        position === 'top' ? 'slide-in-from-top' : 'slide-in-from-bottom'
      )}
    >
      <div className={cn(
        'bg-gradient-to-r shadow-lg',
        config.bgGradient
      )}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-3 sm:py-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3 flex-1">
                {/* Icon */}
                <div className={cn(
                  'flex-shrink-0 p-2 rounded-lg',
                  config.iconBg,
                  'bg-opacity-30'
                )}>
                  <div className={config.textColor}>
                    {config.icon}
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    {notification.title && (
                      <h3 className={cn('font-semibold text-base', config.textColor)}>
                        {notification.title}
                      </h3>
                    )}
                    <p className={cn('text-sm', config.textColor, 'opacity-95')}>
                      {notification.message}
                    </p>
                  </div>

                  {/* Metadata for banner */}
                  {notification.metadata && notification.metadata.details && (
                    <p className={cn('text-xs mt-1', config.textColor, 'opacity-75')}>
                      {notification.metadata.details}
                    </p>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                {notification.actions && notification.actions.map((action, index) => (
                  <button
                    key={index}
                    onClick={action.action}
                    className={cn(
                      'px-4 py-1.5 rounded-lg font-medium text-sm',
                      'transition-colors flex items-center gap-1',
                      config.actionColor
                    )}
                  >
                    {action.label}
                    {action.variant === 'primary' && <ArrowRight className="w-3 h-3" />}
                  </button>
                ))}

                {/* Dismiss button */}
                {notification.dismissible && onDismiss && (
                  <button
                    onClick={() => onDismiss(notification.id)}
                    className={cn(
                      'p-1.5 rounded-lg transition-colors',
                      config.actionColor
                    )}
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};