'use client';

import { useQuery } from '@tanstack/react-query';

import { EstadoVacio } from '@/compartido/componentes/retroalimentacion/estado-vacio';
import { formatearFecha, formatearHora, formatearNumero } from '@/compartido/utilidades/formatear';
import type { OrdenTableroProduccion } from '@/modulos/produccion/servicios/indice';

import { obtenerTiemposIntegradosAccion } from '../acciones/indice';
import { CLAVE_TIEMPOS_INTEGRADOS_ORDEN } from './claves-consulta';

/**
 * C13.4: sesiones donde el operador trabajó varios ítems en una sola corrida.
 * Muestra el avance y los minutos declarados por ítem.
 */
export function PanelTiemposIntegrados({ orden }: { orden: OrdenTableroProduccion | null }) {
  const consulta = useQuery({
    queryKey: [...CLAVE_TIEMPOS_INTEGRADOS_ORDEN, orden?.id ?? 'sin-orden'],
    queryFn: async () => {
      if (!orden) return [];
      const resultado = await obtenerTiemposIntegradosAccion({ ordenId: orden.id });
      if (!resultado.exito || !resultado.datos) {
        throw new Error(resultado.exito ? 'La consulta no devolvió datos' : resultado.error);
      }
      return resultado.datos;
    },
    enabled: orden !== null,
  });
  const tiempos = consulta.data ?? [];
  const sesiones = new Map<string, typeof tiempos>();
  for (const tiempo of tiempos) {
    const lista = sesiones.get(tiempo.sesionId) ?? [];
    lista.push(tiempo);
    sesiones.set(tiempo.sesionId, lista);
  }

  return (
    <section className="rounded-lg border border-borde bg-superficie p-4" data-testid="panel-tiempos-integrados">
      <div>
        <h2 className="text-base font-semibold text-texto-primario">Corridas integradas</h2>
        <p className="mt-1 text-xs text-texto-secundario">
          Sesiones donde se trabajaron varios ítems juntos, con su avance y minutos por ítem cuando fueron identificables.
        </p>
      </div>
      {!orden && <p className="mt-2 text-sm text-texto-secundario">Selecciona una orden del Kanban.</p>}
      {consulta.isError && (
        <p role="alert" className="mt-2 text-sm text-peligro-texto">
          No se pudieron cargar las corridas integradas.
        </p>
      )}
      {orden && !consulta.isLoading && tiempos.length === 0 && (
        <EstadoVacio
          titulo="Sin corridas integradas"
          descripcion="Esta orden no tiene sesiones con varios ítems trabajados juntos."
        />
      )}
      {sesiones.size > 0 && (
        <ul className="mt-3 flex flex-col gap-2" data-testid="lista-tiempos-integrados">
          {[...sesiones.entries()].map(([sesionId, items]) => (
            <li key={sesionId} className="rounded-md border border-borde p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <strong>{items.length} ítems en un solo proceso</strong>
                  {' · '}{items[0]?.operadorNombre}
                </span>
                <span className="text-xs text-texto-secundario">
                  {items[0] ? `${formatearFecha(items[0].fechaInicio)} ${formatearHora(items[0].fechaInicio)}` : ''}
                </span>
              </div>
              <ul className="mt-2 flex flex-col gap-1 text-xs text-texto-secundario">
                {items.map((item) => (
                  <li key={item.partidaId}>
                    {item.codigoPieza}:{' '}
                    <strong>{formatearNumero(item.piezas, 0)}</strong> piezas ·{' '}
                    {item.minutos === null
                      ? 'tiempo a nivel de corrida'
                      : `${formatearNumero(item.minutos, 0)} min`}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
