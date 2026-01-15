import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export function Button({
  className = '',
  variant = 'default',
  size = 'default',
  children,
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles = 'inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none';

  const variantStyles = {
    default: 'bg-gray-900 text-white hover:bg-gray-800',
    outline: 'border border-gray-300 bg-white text-gray-900 hover:bg-gray-50',
    ghost: 'hover:bg-gray-100 text-gray-900',
  };

  const sizeStyles = {
    default: 'h-9 px-4 py-2 text-sm',
    sm: 'h-8 px-3 py-1.5 text-sm',
    lg: 'h-10 px-6 py-2 text-base',
    icon: 'h-9 w-9 p-0',
  };

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
