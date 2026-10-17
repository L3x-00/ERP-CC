import Link from 'next/link';

import { formatearFecha } from '@/compartido/utilidades/formatear';
import type { SaldoEntrega } from '@/modulos/ordenes/utilidades/entrega-orden';
import type { EntregaFicha } from '@/modulos/ordenes/tipos/ficha-orden';

export function PanelEntregasFicha({
  ordenId,
  entregas,
  puedeEntregar = false,
  saldo,
}: {
  ordenId: string;
  entregas: EntregaFicha[];
  /** O-08 (C8.4): solo se entrega con producción completada; la RPC es la autoridad. */
  puedeEntregar?: boolean;
  saldo?: SaldoEntrega;
}) {
  const saldoTexto = saldo
    ? `Entregado ${saldo.entregado}/${saldo.solicitado}; faltan ${saldo.faltan} por entregar`
    : null;
  return (
    <section className="grid gap-3" data-testid="ficha-panel-entregas">
      {saldoTexto ? (
        <p className="text-sm font-semibold" data-testid="ficha-saldo-entrega">{saldoTexto}</p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-texto-secundario">
          Entregas parciales o totales con folio NE; evidencia y firma se capturan en el detalle.
        </p>
        {puedeEntregar ? (
          <Link
            href={`/entregas?orden=${ordenId}`}
            className="rounded-md border border-borde px-3 py-1.5 text-sm font-semibold text-acento hover:bg-superficie-2"
            data-testid="ficha-preparar-entrega"
          >
            Preparar entrega
          </Link>
        ) : (
          <p className="text-xs italic text-texto-secundario" data-testid="ficha-entrega-bloqueada">
            Se habilita al completar la producción (se entrega solo después de producir).
          </p>
        )}
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
