import React from 'react';

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'error';
}

export function Alert({ className = '', variant = 'default', children, ...props }: AlertProps) {
  const baseStyles = 'rounded-lg border p-4';
  const variantStyles = {
    default: 'border-gray-200 bg-gray-50 text-gray-900',
    error: 'border-red-200 bg-red-50 text-red-900',
  };

  return (
    <div className={`${baseStyles} ${variantStyles[variant]} ${className}`} {...props}>
      {children}
    </div>
  );
}

interface AlertDescriptionProps extends React.HTMLAttributes<HTMLDivElement> {}

export function AlertDescription({ className = '', children, ...props }: AlertDescriptionProps) {
  return (
    <div className={`text-sm ${className}`} {...props}>
      {children}
    </div>
  );
}
