import React, { useEffect, useState } from 'react';
import { X, AlertCircle, CheckCircle, AlertTriangle, Info, Bug, Wifi, Activity } from '../ui-simple/Icons';
import type { NotificationMessage, NotificationType, NotificationCategory } from '../../contexts/NotificationContext';
import { cn } from '../../lib/utils';

interface ToastNotificationProps {
  notification: NotificationMessage;
  onDismiss: (id: string) => void;
}

const typeConfig: Record<NotificationType, {
  icon: React.ReactNode;
  bgColor: string;
  borderColor: string;
  iconColor: string;
  titleColor: string;
  progressColor: string;
}> = {
  error: {
    icon: <AlertCircle className="w-5 h-5" />,
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    iconColor: 'text-red-600',
    titleColor: 'text-red-900',
    progressColor: 'bg-red-500',
  },
  warning: {
    icon: <AlertTriangle className="w-5 h-5" />,
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    iconColor: 'text-amber-600',
    titleColor: 'text-amber-900',
    progressColor: 'bg-amber-500',
  },
  success: {
    icon: <CheckCircle className="w-5 h-5" />,
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    iconColor: 'text-emerald-600',
    titleColor: 'text-emerald-900',
    progressColor: 'bg-emerald-500',
  },
  info: {
    icon: <Info className="w-5 h-5" />,
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    iconColor: 'text-blue-600',
    titleColor: 'text-blue-900',
    progressColor: 'bg-blue-500',
  },
  debug: {
    icon: <Bug className="w-5 h-5" />,
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    iconColor: 'text-purple-600',
    titleColor: 'text-purple-900',
    progressColor: 'bg-purple-500',
  },
};

const categoryIcons: Partial<Record<NotificationCategory, React.ReactNode>> = {
  network: <Wifi className="w-4 h-4" />,
  transaction: <Activity className="w-4 h-4" />,
};

export const ToastNotification: React.FC<ToastNotificationProps> = ({ notification, onDismiss }) => {
  const [isExiting, setIsExiting] = useState(false);
  const [progress, setProgress] = useState(100);
  const config = typeConfig[notification.type];

  useEffect(() => {
    if (notification.duration && notification.duration > 0) {
      const interval = setInterval(() => {
        setProgress(prev => {
          const newProgress = prev - (100 / (notification.duration! / 100));
          if (newProgress <= 0) {
            handleDismiss();
            return 0;
          }
          return newProgress;
        });
      }, 100);

      return () => clearInterval(interval);
    }
  }, [notification.duration]);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => {
      onDismiss(notification.id);
    }, 300);
  };

  return (
    <div
      className={cn(
        'relative w-96 max-w-full rounded-xl border shadow-lg overflow-hidden',
        'transform transition-all duration-300 ease-out',
        config.bgColor,
        config.borderColor,
        isExiting ? 'translate-x-full opacity-0' : 'translate-x-0 opacity-100',
        'animate-in slide-in-from-right'
      )}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className={cn('flex-shrink-0 mt-0.5', config.iconColor)}>
            {config.icon}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Header with category */}
            <div className="flex items-center gap-2 mb-1">
              {notification.title && (
                <h3 className={cn('font-semibold text-sm', config.titleColor)}>
                  {notification.title}
                </h3>
              )}
              {notification.category && notification.category !== 'general' && (
                <div className="flex items-center gap-1">
                  {categoryIcons[notification.category] && (
                    <span className={cn('opacity-60', config.iconColor)}>
                      {categoryIcons[notification.category]}
                    </span>
                  )}
                  <span className={cn('text-xs font-medium opacity-60', config.titleColor)}>
                    {notification.category.toUpperCase()}
                  </span>
                </div>
              )}
            </div>

            {/* Message */}
            <p className="text-sm text-gray-700 leading-relaxed">
              {notification.message}
            </p>

            {/* Metadata */}
            {notification.metadata && Object.keys(notification.metadata).length > 0 && (
              <div className="mt-2 p-2 bg-white/50 rounded-lg">
                <dl className="text-xs space-y-1">
                  {Object.entries(notification.metadata).map(([key, value]) => (
                    <div key={key} className="flex items-start gap-2">
                      <dt className="font-medium text-gray-600 min-w-[60px]">{key}:</dt>
                      <dd className="text-gray-800 font-mono break-all">
                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {/* Actions */}
            {notification.actions && notification.actions.length > 0 && (
              <div className="flex items-center gap-2 mt-3">
                {notification.actions.map((action, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      action.action();
                      if (action.variant !== 'secondary') {
                        handleDismiss();
                      }
                    }}
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                      action.variant === 'primary' 
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : action.variant === 'danger'
                        ? 'bg-red-600 text-white hover:bg-red-700'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    )}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Dismiss button */}
          {notification.dismissible && (
            <button
              onClick={handleDismiss}
              className={cn(
                'flex-shrink-0 p-1 rounded-lg transition-colors',
                'hover:bg-white/50',
                config.iconColor
              )}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {notification.duration && notification.duration > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/30">
          <div
            className={cn('h-full transition-all duration-100 ease-linear', config.progressColor)}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Timestamp */}
      <div className="absolute bottom-1 right-2 text-[10px] text-gray-500 opacity-50">
        {notification.timestamp.toLocaleTimeString()}
      </div>
    </div>
  );
};
