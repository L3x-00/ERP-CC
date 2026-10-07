'use client';

import { useId, useState, type ReactNode } from 'react';
import { cn } from '@/compartido/utilidades/cn';
import { Icono } from '@/compartido/componentes/navegacion/iconos';

/**
 * Sección plegable para formularios largos: encabezado en botón con chevron y
 * contenido colapsado por defecto cuando se pide. El contenido queda montado
 * (`hidden`) para no perder los valores de formularios controlados.
 */
export function SeccionColapsable({
  titulo,
  descripcion,
  abiertaInicial = false,
  children,
}: {
  titulo: string;
  descripcion?: string;
  abiertaInicial?: boolean;
  children: ReactNode;
}) {
  const [abierta, setAbierta] = useState(abiertaInicial);
  const idContenido = useId();

  return (
    <section className="overflow-hidden rounded-lg border border-borde">
      <button
        type="button"
        aria-expanded={abierta}
        aria-controls={idContenido}
        onClick={() => setAbierta((valor) => !valor)}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-superficie-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/40"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-texto-primario">{titulo}</span>
          {descripcion ? (
            <span className="mt-0.5 block text-xs text-texto-secundario">{descripcion}</span>
          ) : null}
        </span>
        <Icono
          nombre="chevron"
          className={cn(
            'h-4 w-4 shrink-0 text-texto-tenue transition-transform',
            abierta && 'rotate-180',
          )}
        />
      </button>
      <div id={idContenido} hidden={!abierta} className="border-t border-borde p-4">
        {children}
      </div>
    </section>
  );
}
