'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { ComponentProps } from 'react';
import { cn } from '@/compartido/utilidades/cn';

/**
 * Diálogo modal accesible (shadcn/ui sobre Radix). Trae foco atrapado, cierre
 * con Esc y overlay. Estilado con los tokens del tema (background/foreground).
 */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out" />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4',
          'rounded-base border border-foreground/10 bg-background p-6 shadow-xl',
          'max-h-[90vh] overflow-y-auto',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className="absolute right-4 top-4 text-xl leading-none text-foreground/50 hover:text-foreground"
          aria-label="Cerrar"
        >
          ×
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('flex justify-end gap-2 pt-2', className)} {...props} />
  );
}

export function DialogTitle({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('text-lg font-bold', className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('text-sm text-foreground/60', className)}
      {...props}
    />
  );
}
