import React from 'react';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'outline';
}

export function Badge({ className = '', variant = 'default', children, ...props }: BadgeProps) {
  const baseStyles = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium';
  const variantStyles = {
    default: 'bg-gray-900 text-white',
    secondary: 'bg-gray-100 text-gray-900',
    outline: 'border border-gray-300 text-gray-900',
  };

  return (
    <span className={`${baseStyles} ${variantStyles[variant]} ${className}`} {...props}>
      {children}
    </span>
  );
}
