import React, { createContext, useContext, useState } from 'react';

interface DialogContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DialogContext = createContext<DialogContextValue | undefined>(undefined);

interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

export function Dialog({ open: controlledOpen, onOpenChange, children }: DialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;

  return (
    <DialogContext.Provider value={{ open, onOpenChange: setOpen }}>
      {children}
    </DialogContext.Provider>
  );
}

interface DialogTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

export function DialogTrigger({ children, asChild, ...props }: DialogTriggerProps) {
  const context = useContext(DialogContext);

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      onClick: () => context?.onOpenChange(true),
    } as any);
  }

  return (
    <button onClick={() => context?.onOpenChange(true)} {...props}>
      {children}
    </button>
  );
}

interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {}

export function DialogContent({ className = '', children, ...props }: DialogContentProps) {
  const context = useContext(DialogContext);
  if (!context?.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={() => context.onOpenChange(false)} />
      <div className={`relative z-50 w-full max-w-lg rounded-lg bg-white p-6 shadow-lg ${className}`} {...props}>
        {children}
      </div>
    </div>
  );
}

interface DialogHeaderProps extends React.HTMLAttributes<HTMLDivElement> {}

export function DialogHeader({ className = '', children, ...props }: DialogHeaderProps) {
  return (
    <div className={`mb-4 ${className}`} {...props}>
      {children}
    </div>
  );
}

interface DialogTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {}

export function DialogTitle({ className = '', children, ...props }: DialogTitleProps) {
  return (
    <h2 className={`text-lg font-semibold ${className}`} {...props}>
      {children}
    </h2>
  );
}

interface DialogDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {}

export function DialogDescription({ className = '', children, ...props }: DialogDescriptionProps) {
  return (
    <p className={`text-sm text-gray-600 ${className}`} {...props}>
      {children}
    </p>
  );
}

interface DialogFooterProps extends React.HTMLAttributes<HTMLDivElement> {}

export function DialogFooter({ className = '', children, ...props }: DialogFooterProps) {
  return (
    <div className={`mt-4 flex justify-end gap-2 ${className}`} {...props}>
      {children}
    </div>
  );
}
