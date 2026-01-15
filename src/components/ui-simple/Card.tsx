import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Card({ className = '', children, ...props }: CardProps) {
  const baseStyles = 'rounded-lg border border-gray-200 bg-white shadow-sm';

  return (
    <div className={`${baseStyles} ${className}`} {...props}>
      {children}
    </div>
  );
}
