'use client';

import { cn } from '@/compartido/utilidades/cn';
import { Button } from '@/compartido/componentes/ui/button';
import { Icono } from '@/compartido/componentes/navegacion/iconos';
import { numerosPagina } from '@/compartido/utilidades/paginar';

export interface PaginacionProps {
  pagina: number;
  totalPaginas: number;
  total: number;
  desde: number;
  hasta: number;
  onCambiarPagina: (pagina: number) => void;
  /** Sustantivo del listado, p. ej. «RFQ». */
  etiquetaElemento?: string;
  /** Nombre accesible de la región de paginación. */
  etiqueta?: string;
  className?: string;
}

/**
 * Paginación del sistema: informa el rango visible y permite saltar de página.
 * La página activa se marca con `aria-current="page"`; las flechas usan
 * etiquetas accesibles y se deshabilitan en los extremos. Sin líneas divisorias:
 * la pieza se apoya en el ritmo del texto y píldoras de acento.
 */
export function Paginacion({
  pagina,
  totalPaginas,
  total,
  desde,
  hasta,
  onCambiarPagina,
  etiquetaElemento = 'registros',
  etiqueta = 'Paginación',
  className,
}: PaginacionProps) {
  const paginas = numerosPagina(pagina, totalPaginas);

  return (
    <nav
      aria-label={etiqueta}
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 px-1 py-1',
        className,
      )}
    >
      <p className="text-sm text-texto-secundario" aria-live="polite">
        Mostrando{' '}
        <span className="font-semibold tabular-nums text-texto-primario">
          {desde}–{hasta}
        </span>{' '}
        de <span className="font-semibold tabular-nums text-texto-primario">{total}</span>{' '}
        {etiquetaElemento}
      </p>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          variante="fantasma"
          tamano="sm"
          aria-label="Página anterior"
          disabled={pagina <= 1}
          onClick={() => onCambiarPagina(pagina - 1)}
          className="px-2"
        >
          <Icono nombre="chevron" className="h-4 w-4 rotate-90" />
        </Button>

        {paginas.map((numero, indice) =>
          numero === 'elipsis' ? (
            <span
              key={`elipsis-${indice}`}
              aria-hidden="true"
              className="px-1 text-sm text-texto-tenue"
            >
              …
            </span>
          ) : (
            <Button
              key={numero}
              type="button"
              variante={numero === pagina ? 'primario' : 'fantasma'}
              tamano="sm"
              aria-label={`Página ${numero}`}
              aria-current={numero === pagina ? 'page' : undefined}
              onClick={() => onCambiarPagina(numero)}
              className="min-w-9 px-2 tabular-nums"
            >
              {numero}
            </Button>
          ),
        )}

        <Button
          type="button"
          variante="fantasma"
          tamano="sm"
          aria-label="Página siguiente"
          disabled={pagina >= totalPaginas}
          onClick={() => onCambiarPagina(pagina + 1)}
          className="px-2"
        >
          <Icono nombre="chevron" className="h-4 w-4 -rotate-90" />
        </Button>
      </div>
    </nav>
  );
}
