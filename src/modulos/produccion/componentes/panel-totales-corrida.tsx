'use client';

import { useQuery } from '@tanstack/react-query';

import { EstadoVacio } from '@/compartido/componentes/retroalimentacion/estado-vacio';
import { formatearMoneda, formatearNumero } from '@/compartido/utilidades/formatear';
import type { OrdenTableroProduccion } from '@/modulos/produccion/servicios/indice';

import { obtenerTotalesCorridasOrdenAccion } from '../acciones/totales-corrida';
import { CLAVE_TOTALES_CORRIDAS_ORDEN } from './claves-consulta';

/** C4: tiempo, material y costo por lote, y costo total de la orden. */
export function PanelTotalesCorrida({ orden }: { orden: OrdenTableroProduccion | null }) {
  const consulta = useQuery({
    queryKey: [...CLAVE_TOTALES_CORRIDAS_ORDEN, orden?.id ?? 'sin-orden'],
    queryFn: async () => {
      if (!orden) return null;
      const resultado = await obtenerTotalesCorridasOrdenAccion({ ordenId: orden.id });
      if (!resultado.exito) {
        throw new Error(resultado.exito ? 'Sin datos' : resultado.error);
      }
      return resultado.datos ?? null;
    },
    enabled: orden !== null,
  });
  const datos = consulta.data;
  const conCostos = (datos?.corridas ?? []).some((corrida) => corrida.costoTotalMxn !== null);

  return (
    <section className="rounded-lg border border-borde bg-superficie p-4" data-testid="panel-totales-corrida">
      <div>
        <h2 className="text-base font-semibold text-texto-primario">Totales de corrida</h2>
        <p className="mt-1 text-xs text-texto-secundario">
          Tiempo y material del lote completo. El costo no se reparte entre los ítems.
        </p>
      </div>
      {!orden && <p className="mt-2 text-sm text-texto-secundario">Selecciona una orden del Kanban.</p>}
      {consulta.isError && (
        <p role="alert" className="mt-2 text-sm text-peligro-texto">
          No se pudieron cargar los totales de las corridas.
        </p>
      )}
      {orden && !consulta.isLoading && (datos?.corridas.length ?? 0) === 0 && (
        <EstadoVacio
          titulo="Sin corridas"
          descripcion="Esta orden todavía no tiene corridas registradas."
        />
      )}
      {datos && datos.corridas.length > 0 ? (
        <>
          <ul className="mt-3 flex flex-col gap-2" data-testid="lista-totales-corrida">
            {datos.corridas.map((corrida) => (
              <li key={corrida.corridaId} className="rounded-md border border-borde p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong data-testid={`corrida-total-${corrida.codigo}`}>
                    {corrida.codigo} · {corrida.estado}
                  </strong>
                  {conCostos && corrida.costoTotalMxn !== null ? (
                    <span className="tabular-nums">{formatearMoneda(corrida.costoTotalMxn, 'MXN')}</span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-texto-secundario">
                  {formatearNumero(corrida.horasTotales, 2)} h ·{' '}
                  {formatearNumero(corrida.piezasProducidas, 0)} piezas ·{' '}
                  {formatearNumero(corrida.cantidadMaterial, 2)} de material
                </p>
              </li>
            ))}
          </ul>
          {conCostos ? (
            <p data-testid="costo-total-orden" className="mt-3 text-sm font-semibold">
              Costo total de la orden:{' '}
              {datos.costoTotalOrdenMxn === null
                ? 'No calculable (sin desglose)'
                : formatearMoneda(datos.costoTotalOrdenMxn, 'MXN')}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
