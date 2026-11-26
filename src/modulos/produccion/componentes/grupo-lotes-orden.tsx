'use client';

import { cn } from '@/compartido/utilidades/cn';
import type { GrupoLotesOrden as GrupoLotes } from '@/modulos/produccion/servicios/lotes-tablero-servicio';
import type { LoteTablero } from '@/modulos/produccion/tipos/indice';
import { TarjetaLote } from './tarjeta-lote';

interface PropsGrupoLotesOrden {
  grupo: GrupoLotes;
  testIdPrefijo: string;
  onAbrirOrden?: (ordenId: string) => void;
  onAbrirLote?: (lote: LoteTablero) => void;
  className?: string;
}

/**
 * Los lotes son corridas distintas y no se fusionan: solo comparten la
 * cabecera de la orden para que el piso no muestre una tarjeta por lote.
 */
export function GrupoLotesOrden({
  grupo,
  testIdPrefijo,
  onAbrirOrden,
  onAbrirLote,
  className,
}: PropsGrupoLotesOrden) {
  return (
    <section
      className={cn('flex min-w-0 flex-col gap-1.5', className)}
      data-testid={`${testIdPrefijo}-grupo-${grupo.ordenId}`}
      aria-label={`Lotes de la orden ${grupo.folioOrden}`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-1 px-1">
        <p className="truncate font-mono text-xs font-semibold text-texto-primario">
          {grupo.folioOrden}
        </p>
        <p className="text-[10px] text-texto-tenue">
          {grupo.lotes.length} lote{grupo.lotes.length === 1 ? '' : 's'} · {grupo.clienteNombre}
        </p>
      </header>
      <div className="flex flex-col gap-1.5">
        {grupo.lotes.map((lote) => (
          <TarjetaLote
            key={lote.id}
            lote={lote}
            testId={`${testIdPrefijo}-${lote.id}`}
            onAbrirOrden={onAbrirOrden}
            onAbrirLote={onAbrirLote}
            compacta
          />
        ))}
      </div>
    </section>
  );
}
