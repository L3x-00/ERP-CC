'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { ComponentProps } from 'react';
import { cn } from '@/compartido/utilidades/cn';

/**
 * Diálogo modal accesible (shadcn/ui sobre Radix). Overlay atenuado con blur,
 * foco atrapado, cierre con Esc, superficie del sistema y entrada animada
 * (respeta `prefers-reduced-motion`). El pie puede fijarse con `DialogFooter`.
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
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[4px]" />
      <DialogPrimitive.Content
        className={cn(
          'animar-entrada fixed left-1/2 top-1/2 z-50 grid w-[calc(100vw-2rem)] max-w-[640px] -translate-x-1/2 -translate-y-1/2 gap-4',
          'max-h-[90vh] overflow-y-auto rounded-xl border border-borde bg-superficie p-6 shadow-lg',
          'scroll-sutil',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className="absolute right-4 top-4 rounded-md p-1 text-xl leading-none text-texto-secundario transition-colors hover:bg-superficie-2 hover:text-texto-primario focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/40"
          aria-label="Cerrar"
        >
          ×
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1 pr-8', className)} {...props} />;
}

/** Pie de acciones; se mantiene visible al hacer scroll del contenido. */
export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'sticky bottom-0 -mx-6 -mb-6 flex flex-wrap justify-end gap-2 border-t border-borde bg-superficie px-6 py-4',
        className,
      )}
      {...props}
    />
  );
}

export function DialogTitle({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('text-lg font-bold text-texto-primario', className)}
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
      className={cn('text-sm text-texto-secundario', className)}
      {...props}
    />
  );
}
