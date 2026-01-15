import React, { createContext, useContext, useState } from 'react';

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
}

const TabsContext = createContext<TabsContextValue | undefined>(undefined);

interface TabsProps {
  defaultValue: string;
  className?: string;
  children: React.ReactNode;
}

export function Tabs({ defaultValue, className = '', children }: TabsProps) {
  const [value, setValue] = useState(defaultValue);

  return (
    <TabsContext.Provider value={{ value, onValueChange: setValue }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

interface TabsListProps extends React.HTMLAttributes<HTMLDivElement> {}

export function TabsList({ className = '', children, ...props }: TabsListProps) {
  return (
    <div className={`inline-flex h-10 items-center justify-center rounded-md bg-gray-100 p-1 ${className}`} {...props}>
      {children}
    </div>
  );
}

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

export function TabsTrigger({ className = '', value, children, ...props }: TabsTriggerProps) {
  const context = useContext(TabsContext);
  const isActive = context?.value === value;

  return (
    <button
      className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all ${
        isActive ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
      } ${className}`}
      onClick={() => context?.onValueChange(value)}
      {...props}
    >
      {children}
    </button>
  );
}

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

export function TabsContent({ className = '', value, children, ...props }: TabsContentProps) {
  const context = useContext(TabsContext);
  if (context?.value !== value) return null;

  return (
    <div className={`mt-2 ${className}`} {...props}>
      {children}
    </div>
  );
}
