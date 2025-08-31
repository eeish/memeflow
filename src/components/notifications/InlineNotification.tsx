import React from 'react';
import { X, AlertCircle, CheckCircle, AlertTriangle, Info, Bug } from 'lucide-react';
import type { NotificationMessage, NotificationType } from '../../contexts/NotificationContext';
import { cn } from '../../lib/utils';

interface InlineNotificationProps {
  notification?: NotificationMessage;
  onDismiss?: (id: string) => void;
  compact?: boolean;
  // Alternative simple props
  type?: NotificationType;
  title?: string;
  message?: string;
  className?: string;
  children?: React.ReactNode;
}

const typeConfig: Record<NotificationType, {
  icon: React.ReactNode;
  bgColor: string;
  borderColor: string;
  iconColor: string;
  textColor: string;
}> = {
  error: {
    icon: <AlertCircle className="w-5 h-5" />,
    bgColor: 'bg-red-50',
    borderColor: 'border-red-300',
    iconColor: 'text-red-600',
    textColor: 'text-red-900',
  },
  warning: {
    icon: <AlertTriangle className="w-5 h-5" />,
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-300',
    iconColor: 'text-amber-600',
    textColor: 'text-amber-900',
  },
  success: {
    icon: <CheckCircle className="w-5 h-5" />,
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-300',
    iconColor: 'text-emerald-600',
    textColor: 'text-emerald-900',
  },
  info: {
    icon: <Info className="w-5 h-5" />,
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-300',
    iconColor: 'text-blue-600',
    textColor: 'text-blue-900',
  },
  debug: {
    icon: <Bug className="w-5 h-5" />,
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-300',
    iconColor: 'text-purple-600',
    textColor: 'text-purple-900',
  },
};

export const InlineNotification: React.FC<InlineNotificationProps> = ({ 
  notification, 
  onDismiss,
  compact = false,
  type,
  title,
  message,
  className,
  children
}) => {
  // Create a notification object from simple props if needed
  const notif = notification || {
    id: 'inline-' + Date.now(),
    type: type || 'info',
    title,
    message: message || '',
    display: 'inline' as const,
    timestamp: new Date(),
    dismissible: !!onDismiss
  };
  
  const config = typeConfig[notif.type];

  return (
    <div
      className={cn(
        'rounded-lg border',
        config.bgColor,
        config.borderColor,
        compact ? 'p-3' : 'p-4',
        'animate-in fade-in slide-in-from-top-2 duration-300',
        className
      )}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={cn('flex-shrink-0', compact ? 'mt-0' : 'mt-0.5', config.iconColor)}>
          {config.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {notif.title && !compact && (
            <h4 className={cn('font-semibold text-sm mb-1', config.textColor)}>
              {notif.title}
            </h4>
          )}
          <p className={cn(
            compact ? 'text-sm' : 'text-sm leading-relaxed',
            config.textColor,
            'opacity-90'
          )}>
            {notif.message}
          </p>

          {/* Children content */}
          {children && (
            <div className={cn('mt-2', config.textColor, 'opacity-90')}>
              {children}
            </div>
          )}

          {/* Actions */}
          {notif.actions && notif.actions.length > 0 && !compact && (
            <div className="flex items-center gap-2 mt-3">
              {notif.actions.map((action, index) => (
                <button
                  key={index}
                  onClick={action.action}
                  className={cn(
                    'text-sm font-medium underline-offset-2 hover:underline',
                    config.iconColor
                  )}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Dismiss button */}
        {notif.dismissible && onDismiss && (
          <button
            onClick={() => onDismiss(notif.id)}
            className={cn(
              'flex-shrink-0 p-1 rounded transition-colors',
              'hover:bg-white/60',
              config.iconColor
            )}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};