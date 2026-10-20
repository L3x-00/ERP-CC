'use client';

import { Button } from '@/compartido/componentes/ui/button';
import { Skeleton } from '@/compartido/componentes/retroalimentacion/skeleton';

/** Bloques de interfaz compartidos por las secciones del historial del cliente. */

export function BotonExpandir({
  expandida,
  idDetalle,
  etiqueta,
  onAlternar,
}: {
  expandida: boolean;
  idDetalle: string;
  etiqueta: string;
  onAlternar: () => void;
}) {
  return (
    <Button
      variante="fantasma"
      tamano="sm"
      onClick={onAlternar}
      aria-expanded={expandida}
      aria-controls={idDetalle}
      aria-label={`${expandida ? 'Ocultar' : 'Ver'} ${etiqueta}`}
    >
      {expandida ? 'Ocultar detalle' : 'Ver detalle'}
    </Button>
  );
}

export function BloqueError({
  mensaje,
  reintentando,
  onReintentar,
}: {
  mensaje: string;
  reintentando: boolean;
  onReintentar: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-peligro/30 bg-peligro-suave px-4 py-3 text-sm text-peligro-texto"
    >
      <span>{mensaje}</span>
      <Button variante="contorno" tamano="sm" onClick={onReintentar} disabled={reintentando}>
        {reintentando ? 'Reintentando…' : 'Reintentar'}
      </Button>
    </div>
  );
}

export function SkeletonHistorial({ etiqueta }: { etiqueta: string }) {
  return (
    <div className="flex flex-col gap-2" role="status" aria-label={etiqueta}>
      {[0, 1, 2].map((indice) => (
        <Skeleton key={indice} className="h-16 w-full" />
      ))}
    </div>
  );
}

export function Paginador({
  etiqueta,
  pagina,
  total,
  porPagina,
  onCambiar,
}: {
  etiqueta: string;
  pagina: number;
  total: number;
  porPagina: number;
  onCambiar: (pagina: number) => void;
}) {
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  if (totalPaginas <= 1) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-texto-secundario">
      <span>
        Página {pagina} de {totalPaginas}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variante="contorno"
          tamano="sm"
          onClick={() => onCambiar(Math.max(1, pagina - 1))}
          disabled={pagina <= 1}
          aria-label={`Página anterior de ${etiqueta}`}
        >
          Anterior
        </Button>
        <Button
          variante="contorno"
          tamano="sm"
          onClick={() => onCambiar(Math.min(totalPaginas, pagina + 1))}
          disabled={pagina >= totalPaginas}
          aria-label={`Página siguiente de ${etiqueta}`}
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}
