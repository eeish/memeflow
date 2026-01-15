import React, { createContext, useContext, useState, useRef, useEffect } from 'react';

interface DropdownMenuContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const DropdownMenuContext = createContext<DropdownMenuContextValue | undefined>(undefined);

interface DropdownMenuProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

export function DropdownMenu({ open: controlledOpen, onOpenChange, children }: DropdownMenuProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;

  return (
    <DropdownMenuContext.Provider value={{ open, setOpen }}>
      <div className="relative inline-block">{children}</div>
    </DropdownMenuContext.Provider>
  );
}

interface DropdownMenuTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

export function DropdownMenuTrigger({ children, asChild, ...props }: DropdownMenuTriggerProps) {
  const context = useContext(DropdownMenuContext);

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      onClick: () => context?.setOpen(!context.open),
    } as any);
  }

  return (
    <button onClick={() => context?.setOpen(!context.open)} {...props}>
      {children}
    </button>
  );
}

interface DropdownMenuContentProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: 'start' | 'center' | 'end';
}

export function DropdownMenuContent({ className = '', align = 'end', children, ...props }: DropdownMenuContentProps) {
  const context = useContext(DropdownMenuContext);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        context?.setOpen(false);
      }
    };

    if (context?.open) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [context]);

  if (!context?.open) return null;

  return (
    <div
      ref={ref}
      className={`absolute right-0 mt-2 w-48 rounded-md border border-gray-200 bg-white shadow-lg z-50 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

interface DropdownMenuItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

export function DropdownMenuItem({ className = '', children, ...props }: DropdownMenuItemProps) {
  const context = useContext(DropdownMenuContext);

  return (
    <button
      className={`w-full text-left px-4 py-2 text-sm text-gray-900 hover:bg-gray-100 first:rounded-t-md last:rounded-b-md ${className}`}
      onClick={(e) => {
        props.onClick?.(e);
        context?.setOpen(false);
      }}
      {...props}
    >
      {children}
    </button>
  );
}

interface DropdownMenuSeparatorProps extends React.HTMLAttributes<HTMLDivElement> {}

export function DropdownMenuSeparator({ className = '', ...props }: DropdownMenuSeparatorProps) {
  return <div className={`my-1 h-px bg-gray-200 ${className}`} {...props} />;
}

interface DropdownMenuLabelProps extends React.HTMLAttributes<HTMLDivElement> {}

export function DropdownMenuLabel({ className = '', children, ...props }: DropdownMenuLabelProps) {
  return (
    <div className={`px-4 py-2 text-xs font-semibold text-gray-500 ${className}`} {...props}>
      {children}
    </div>
  );
}
