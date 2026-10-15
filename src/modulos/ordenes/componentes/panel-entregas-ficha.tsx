import Link from 'next/link';

import { formatearFecha } from '@/compartido/utilidades/formatear';
import type { EntregaFicha } from '@/modulos/ordenes/tipos/ficha-orden';

export function PanelEntregasFicha({ ordenId, entregas }: { ordenId: string; entregas: EntregaFicha[] }) {
  return (
    <section className="grid gap-3" data-testid="ficha-panel-entregas">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-texto-secundario">
          Entregas parciales o totales con folio NE; evidencia y firma se capturan en el detalle.
        </p>
        <Link
          href={`/entregas?orden=${ordenId}`}
          className="rounded-md border border-borde px-3 py-1.5 text-sm font-semibold text-acento hover:bg-superficie-2"
          data-testid="ficha-preparar-entrega"
        >
          Preparar entrega
        </Link>
      </div>
      {entregas.length === 0 ? (
        <p className="text-sm text-texto-secundario">Sin notas de entrega registradas.</p>
      ) : entregas.map((entrega) => (
        <article key={entrega.id} className="rounded-md border border-borde p-3 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <Link
              href={`/entregas/${entrega.id}`}
              className="font-mono font-semibold text-acento underline"
              data-testid={`ficha-entrega-${entrega.folioSii ?? entrega.folio}`}
            >
              {entrega.folioSii ?? entrega.folio}
            </Link>
            <span className="text-texto-secundario">
              {entrega.esParcial ? 'Parcial' : 'Total'} · {entrega.recibidoPor} · {formatearFecha(entrega.creadoEn)}
            </span>
          </div>
          <p className="mt-1 text-xs text-texto-secundario">
            {entrega.partidas.reduce((suma, renglon) => suma + renglon.cantidadEntregada, 0)} piezas entregadas
          </p>
        </article>
      ))}
    </section>
  );
}
