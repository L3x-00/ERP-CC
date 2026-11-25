'use client';

import { useQuery } from '@tanstack/react-query';

import { EstadoVacio } from '@/compartido/componentes/retroalimentacion/estado-vacio';
import { formatearFecha, formatearHora, formatearNumero } from '@/compartido/utilidades/formatear';
import type { OrdenTableroProduccion } from '@/modulos/produccion/servicios/indice';

import { obtenerTiemposIntegradosAccion } from '../acciones/indice';
import { CLAVE_TIEMPOS_INTEGRADOS_ORDEN } from './claves-consulta';

/**
 * C5: sesiones de corrida donde el operador trabajó varios ítems juntos.
 * Se agrupan por código de corrida y muestran el avance por ítem.
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
    const clave = tiempo.corridaCodigo ?? tiempo.sesionId;
    const lista = sesiones.get(clave) ?? [];
    lista.push(tiempo);
    sesiones.set(clave, lista);
  }

  return (
    <section className="rounded-lg border border-borde bg-superficie p-4" data-testid="panel-tiempos-integrados">
      <div>
        <h2 className="text-base font-semibold text-texto-primario">Sesiones de Corrida</h2>
        <p className="mt-1 text-xs text-texto-secundario">
          Agrupa el tiempo y la auditoría de las piezas trabajadas juntas en cada corrida.
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
          titulo="Sin sesiones de corrida"
          descripcion="Esta orden no tiene sesiones con varios ítems trabajados juntos."
        />
      )}
      {sesiones.size > 0 && (
        <ul className="mt-3 flex flex-col gap-2" data-testid="lista-tiempos-integrados">
          {[...sesiones.entries()].map(([claveCorrida, items]) => {
            const unicos = [...new Map(items.map((item) => [item.partidaId, item])).values()];
            return (
            <li key={claveCorrida} className="rounded-md border border-borde p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <strong data-testid={`sesion-corrida-${claveCorrida}`}>
                    {claveCorrida} · {unicos.length} ítems en un solo proceso
                  </strong>
                  {' · '}{unicos[0]?.operadorNombre}
                </span>
                <span className="text-xs text-texto-secundario">
                  {unicos[0] ? `${formatearFecha(unicos[0].fechaInicio)} ${formatearHora(unicos[0].fechaInicio)}` : ''}
                </span>
              </div>
              <ul className="mt-2 flex flex-col gap-1 text-xs text-texto-secundario">
                {unicos.map((item) => (
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
            );
          })}
        </ul>
      )}
    </section>
  );
}
