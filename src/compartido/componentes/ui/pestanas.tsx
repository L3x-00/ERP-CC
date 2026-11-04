'use client';

import { useRef } from 'react';

import { cn } from '@/compartido/utilidades/cn';

export type PestanaModulo = {
  id: string;
  etiqueta: string;
  /** Detalle breve para lectores de pantalla. */
  descripcion?: string;
};

/**
 * Pestañas de un módulo. Navegables con teclado (flechas, Inicio y Fin) y con
 * `aria-selected`, para que el módulo centralizado conserve una sola ruta y
 * siga siendo accesible.
 */
export function PestanasModulo({
  pestanas,
  activa,
  onCambiar,
  etiqueta,
}: {
  pestanas: readonly PestanaModulo[];
  activa: string;
  onCambiar: (id: string) => void;
  etiqueta: string;
}) {
  const referencias = useRef(new Map<string, HTMLButtonElement>());

  function mover(direccion: 1 | -1): void {
    const indice = pestanas.findIndex((pestana) => pestana.id === activa);
    const siguiente = pestanas[(indice + direccion + pestanas.length) % pestanas.length];
    if (!siguiente) return;
    onCambiar(siguiente.id);
    referencias.current.get(siguiente.id)?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={etiqueta}
      className="flex flex-wrap gap-1 border-b border-borde"
      onKeyDown={(evento) => {
        if (evento.key === 'ArrowRight') {
          evento.preventDefault();
          mover(1);
        } else if (evento.key === 'ArrowLeft') {
          evento.preventDefault();
          mover(-1);
        } else if (evento.key === 'Home') {
          evento.preventDefault();
          const primera = pestanas[0];
          if (primera) {
            onCambiar(primera.id);
            referencias.current.get(primera.id)?.focus();
          }
        } else if (evento.key === 'End') {
          evento.preventDefault();
          const ultima = pestanas[pestanas.length - 1];
          if (ultima) {
            onCambiar(ultima.id);
            referencias.current.get(ultima.id)?.focus();
          }
        }
      }}
    >
      {pestanas.map((pestana) => (
        <button
          key={pestana.id}
          ref={(elemento) => {
            if (elemento) referencias.current.set(pestana.id, elemento);
            else referencias.current.delete(pestana.id);
          }}
          type="button"
          role="tab"
          aria-selected={activa === pestana.id}
          tabIndex={activa === pestana.id ? 0 : -1}
          data-testid={`pestana-modulo-${pestana.id}`}
          title={pestana.descripcion}
          onClick={() => onCambiar(pestana.id)}
          className={cn(
            '-mb-px rounded-t-md border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/40',
            activa === pestana.id
              ? 'border-acento bg-acento-suave text-acento'
              : 'border-transparent text-texto-secundario hover:bg-superficie-2 hover:text-texto-primario',
          )}
        >
          {pestana.etiqueta}
        </button>
      ))}
    </div>
  );
}
