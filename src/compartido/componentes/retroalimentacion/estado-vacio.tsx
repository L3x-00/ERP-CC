import type { ReactNode } from 'react';
import { cn } from '@/compartido/utilidades/cn';

type PropsEstadoVacio = {
  titulo: string;
  descripcion?: string;
  /** Acción sugerida (botón o enlace) que se muestra bajo el texto. */
  accion?: ReactNode;
  /** Icono opcional; por defecto se dibuja una bandeja vacía. */
  icono?: ReactNode;
  className?: string;
};

/** Estado vacío estándar: icono, título, explicación y CTA opcional. */
export function EstadoVacio({ titulo, descripcion, accion, icono, className }: PropsEstadoVacio) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-borde-fuerte bg-superficie px-6 py-12 text-center',
        className,
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-superficie-2 text-texto-tenue">
        {icono ?? (
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-6 w-6 fill-none stroke-current"
            strokeWidth="1.6"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5 12 12l9-4.5M12 12v9" />
          </svg>
        )}
      </span>
      <p className="text-sm font-semibold text-texto-primario">{titulo}</p>
      {descripcion ? <p className="max-w-md text-sm text-texto-secundario">{descripcion}</p> : null}
      {accion ? <div className="mt-2">{accion}</div> : null}
    </div>
  );
}
