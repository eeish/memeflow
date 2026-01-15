import React from 'react';

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {}

export function Label({ className = '', children, ...props }: LabelProps) {
  const baseStyles = 'text-sm font-medium text-gray-900';

  return (
    <label className={`${baseStyles} ${className}`} {...props}>
      {children}
    </label>
  );
}
