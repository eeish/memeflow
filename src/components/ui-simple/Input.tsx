import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export function Input({ className = '', ...props }: InputProps) {
  const baseStyles = 'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:opacity-50 disabled:cursor-not-allowed';

  return <input className={`${baseStyles} ${className}`} {...props} />;
}
