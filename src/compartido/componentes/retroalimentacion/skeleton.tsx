import type { ComponentProps } from 'react';
import { cn } from '@/compartido/utilidades/cn';

/** Bloque de carga con shimmer; imita la estructura real de la pantalla. */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      className={cn('skeleton-brillo rounded-md', className)}
      {...props}
    />
  );
}

/** Skeleton de tabla: encabezado + N filas con la misma rejilla del listado. */
export function SkeletonTabla({
  filas = 6,
  columnas = 5,
  className,
}: {
  filas?: number;
  columnas?: number;
  className?: string;
}) {
  return (
    <div
      className={cn('overflow-hidden rounded-lg border border-borde bg-superficie', className)}
      role="status"
      aria-label="Cargando datos"
    >
      <div className="flex gap-4 border-b border-borde bg-superficie-2 px-4 py-3">
        {Array.from({ length: columnas }).map((_, indice) => (
          <Skeleton key={indice} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: filas }).map((_, fila) => (
        <div key={fila} className="flex gap-4 border-b border-borde px-4 py-4 last:border-b-0">
          {Array.from({ length: columnas }).map((_, columna) => (
            <Skeleton key={columna} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
