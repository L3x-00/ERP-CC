'use client';

import { cn } from '@/compartido/utilidades/cn';
import { definicionEstado, type TonoEstado } from '@/compartido/utilidades/estados';

export type { TonoEstado };

const TONOS: Record<TonoEstado, string> = {
  neutro: 'bg-superficie-2 text-texto-secundario',
  exito: 'bg-exito-suave text-exito-texto',
  advertencia: 'bg-advertencia-suave text-advertencia-texto',
  peligro: 'bg-peligro-suave text-peligro-texto',
  info: 'bg-info-suave text-info-texto',
};

const PUNTOS: Record<TonoEstado, string> = {
  neutro: 'bg-texto-tenue',
  exito: 'bg-exito',
  advertencia: 'bg-advertencia',
  peligro: 'bg-peligro',
  info: 'bg-info',
};

type PropsBadgeEstado = {
  estado: string;
  /** Sobrescribe la etiqueta derivada del mapa. */
  etiqueta?: string;
  /** Sobrescribe el tono cuando el mismo estado significa algo distinto por módulo. */
  tono?: TonoEstado;
  className?: string;
};

/**
 * Badge de estado único del ERP: fondo semántico suave, punto de color y
 * etiqueta legible. `en_proceso`/`en_uso`/`vencida` usan punto pulsante.
 */
export function BadgeEstado({ estado, etiqueta, tono: tonoForzado, className }: PropsBadgeEstado) {
  const definicion = definicionEstado(estado);
  const tono: TonoEstado = tonoForzado ?? definicion?.tono ?? 'neutro';
  const texto = etiqueta ?? definicion?.etiqueta ?? estado;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium',
        TONOS[tono],
        className,
      )}
    >
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        {definicion?.ping ? (
          <span
            className={cn(
              'punto-en-proceso absolute inline-flex h-full w-full rounded-full opacity-75',
              PUNTOS[tono],
            )}
          />
        ) : null}
        <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', PUNTOS[tono])} />
      </span>
      {texto}
    </span>
  );
}
