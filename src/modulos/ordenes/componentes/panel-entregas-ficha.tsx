import Link from 'next/link';

import { formatearFecha, formatearNumero } from '@/compartido/utilidades/formatear';
import type {
  EntregaFicha,
  PartidaFicha,
} from '@/modulos/ordenes/tipos/ficha-orden';
import type { SaldoEntrega } from '@/modulos/ordenes/utilidades/entrega-orden';
import { NotaEntregaDocumentoBoton } from '@/modulos/produccion/componentes/nota-entrega-documento-boton';

/**
 * C14.3: historial de entregas parciales de la orden con pendiente por ítem.
 * Las cantidades se recalculan desde las notas registradas; la vista se
 * refresca en tiempo real con el sincronizador de órdenes.
 */
export function PanelEntregasFicha({
  ordenId,
  entregas,
  puedeEntregar = false,
  saldo,
  partidas = [],
}: {
  ordenId: string;
  entregas: EntregaFicha[];
  /** O-08 (C8.4): solo se entrega con producción completada; la RPC es la autoridad. */
  puedeEntregar?: boolean;
  saldo?: SaldoEntrega;
  partidas?: PartidaFicha[];
}) {
  const entregadoPorPartida = new Map<string, number>();
  for (const entrega of entregas) {
    if (entrega.estado === 'ANULADA') continue;
    for (const renglon of entrega.partidas) {
      entregadoPorPartida.set(
        renglon.partidaId,
        (entregadoPorPartida.get(renglon.partidaId) ?? 0) + renglon.cantidadEntregada,
      );
    }
  }
  const codigoPorPartida = new Map(partidas.map((partida) => [partida.id, partida.codigoPieza]));
  const pendientes = partidas.map((partida) => {
    const entregada = entregadoPorPartida.get(partida.id) ?? 0;
    return {
      ...partida,
      entregada,
      porEntregar: Math.max((partida.cantidadConforme ?? partida.cantidadProducida) - entregada, 0),
      pendienteTotal: Math.max(partida.cantidadSolicitada - entregada, 0),
    };
  });

  const saldoTexto = saldo
    ? `Entregado ${formatearNumero(saldo.entregado, 2)} de ${formatearNumero(saldo.solicitado, 2)}; faltan ${formatearNumero(saldo.faltan, 2)} por entregar`
    : null;
  const entregadaPorCompleto = saldo !== undefined && saldo.faltan <= 0;

  return (
    <section className="grid gap-3" data-testid="ficha-panel-entregas">
      {saldoTexto ? (
        <p className="text-sm font-semibold" data-testid="ficha-saldo-entrega">{saldoTexto}</p>
      ) : null}

      {pendientes.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-borde">
          <table className="w-full min-w-[620px] border-collapse text-sm" data-testid="ficha-pendientes-entrega">
            <thead>
              <tr className="bg-superficie-2 text-left text-xs uppercase tracking-wide text-texto-tenue">
                <th className="px-3 py-2 font-medium">Ítem</th>
                <th className="px-3 py-2 text-right font-medium">Solicitado</th>
                <th className="px-3 py-2 text-right font-medium">Producido</th>
                <th className="px-3 py-2 text-right font-medium">Entregado</th>
                <th className="px-3 py-2 text-right font-medium">Por entregar</th>
                <th className="px-3 py-2 text-right font-medium">Pendiente total</th>
              </tr>
            </thead>
            <tbody>
              {pendientes.map((partida) => (
                <tr key={partida.id} className="border-t border-borde">
                  <td className="px-3 py-1.5 font-mono text-xs text-texto-primario">{partida.codigoPieza}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatearNumero(partida.cantidadSolicitada, 2)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatearNumero(partida.cantidadProducida, 2)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatearNumero(partida.entregada, 2)}</td>
                  <td className={`px-3 py-1.5 text-right tabular-nums ${partida.porEntregar > 0 ? 'font-semibold text-acento-texto' : 'text-texto-secundario'}`}>
                    {formatearNumero(partida.porEntregar, 2)}
                  </td>
                  <td className={`px-3 py-1.5 text-right tabular-nums ${partida.pendienteTotal > 0 ? 'text-texto-primario' : 'text-exito-texto'}`}>
                    {formatearNumero(partida.pendienteTotal, 2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-texto-secundario">
          Entregas parciales o totales con folio NE. El pendiente se descuenta al registrar cada nota.
        </p>
        {entregadaPorCompleto ? (
          <p className="text-sm font-medium text-exito-texto" data-testid="ficha-entrega-completa">
            La orden está entregada por completo; no hay piezas pendientes.
          </p>
        ) : puedeEntregar ? (
          <Link
            href={`/entregas?orden=${ordenId}`}
            className="rounded-md border border-borde px-3 py-1.5 text-sm font-semibold text-acento hover:bg-superficie-2"
            data-testid="ficha-preparar-entrega"
          >
            Preparar entrega
          </Link>
        ) : (
          <p className="text-xs italic text-texto-secundario" data-testid="ficha-entrega-bloqueada">
            Se habilita cuando la orden entra a producción; solo se entregan piezas conformes.
          </p>
        )}
      </div>

      {entregas.length === 0 ? (
        <p className="rounded-lg border border-borde bg-superficie-2/40 p-3 text-sm text-texto-secundario" data-testid="ficha-sin-entregas">
          Todavía no hay notas de entrega para esta orden.
        </p>
      ) : (
        <div className="grid gap-2" data-testid="ficha-historial-entregas">
          {entregas.map((entrega) => (
            <article key={entrega.id} className="rounded-lg border border-borde p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    href={`/entregas/${entrega.id}`}
                    className="font-mono font-semibold text-acento underline"
                    data-testid={`ficha-entrega-${entrega.folioSii ?? entrega.folio}`}
                  >
                    {entrega.folioSii ?? entrega.folio}
                  </Link>
                  <p className="mt-0.5 text-xs text-texto-secundario">
                    {entrega.esParcial ? 'Entrega parcial' : 'Entrega total'} · {entrega.recibidoPor} ·{' '}
                    {formatearFecha(entrega.creadoEn)}
                  </p>
                </div>
                <NotaEntregaDocumentoBoton
                  notaId={entrega.id}
                  folio={entrega.folioSii ?? entrega.folio}
                />
              </div>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-texto-secundario">
                {entrega.partidas.map((renglon) => (
                  <li key={renglon.partidaId}>
                    {codigoPorPartida.get(renglon.partidaId) ?? 'Ítem'}:{' '}
                    <strong className="text-texto-primario">
                      {formatearNumero(renglon.cantidadEntregada, 2)}
                    </strong>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
