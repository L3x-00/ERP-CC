'use client';

import { useQuery } from '@tanstack/react-query';

import { EstadoVacio } from '@/compartido/componentes/retroalimentacion/estado-vacio';
import { formatearFecha, formatearHora, formatearNumero } from '@/compartido/utilidades/formatear';
import { ETIQUETAS_CAUSA_RETRABAJO } from '@/modulos/produccion/utilidades/indice';
import type { OrdenTableroProduccion } from '@/modulos/produccion/servicios/indice';

import { obtenerRetrabajosOrdenAccion } from '../acciones/indice';
import { CLAVE_RETRABAJOS_ORDEN } from './claves-consulta';

/**
 * C13.2: retrabajos de la orden en solo lectura. El operador los declara al
 * cerrar su sesión; administración revisa material, tiempo y causa.
 */
export function PanelRetrabajosProduccion({ orden }: { orden: OrdenTableroProduccion | null }) {
  const consulta = useQuery({
    queryKey: [...CLAVE_RETRABAJOS_ORDEN, orden?.id ?? 'sin-orden'],
    queryFn: async () => {
      if (!orden) return [];
      const resultado = await obtenerRetrabajosOrdenAccion({ ordenId: orden.id });
      if (!resultado.exito || !resultado.datos) {
        throw new Error(resultado.exito ? 'La consulta no devolvió datos' : resultado.error);
      }
      return resultado.datos;
    },
    enabled: orden !== null,
  });
  const retrabajos = consulta.data ?? [];

  return (
    <section className="rounded-lg border border-borde bg-superficie p-4" data-testid="panel-retrabajos">
      <div>
        <h2 className="text-base font-semibold text-texto-primario">Retrabajos</h2>
        <p className="mt-1 text-xs text-texto-secundario">
          Trabajo extra declarado por el operador al cerrar. No altera el avance del ítem.
        </p>
      </div>
      {!orden && <p className="mt-2 text-sm text-texto-secundario">Selecciona una orden del Kanban.</p>}
      {consulta.isError && (
        <p role="alert" className="mt-2 text-sm text-peligro-texto">
          No se pudieron cargar los retrabajos.
        </p>
      )}
      {orden && !consulta.isLoading && retrabajos.length === 0 && (
        <EstadoVacio
          titulo="Sin retrabajos"
          descripcion="Esta orden no tiene trabajo extra registrado."
        />
      )}
      {retrabajos.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2" data-testid="lista-retrabajos">
          {retrabajos.map((retrabajo) => (
            <li key={retrabajo.id} className="rounded-md border border-borde p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <strong>{retrabajo.codigoPieza}</strong>
                  {' · '}{ETIQUETAS_CAUSA_RETRABAJO[retrabajo.causa]}
                  {' · '}{formatearNumero(retrabajo.minutos, 0)} min
                </span>
                <span className="text-xs text-texto-secundario">
                  {formatearFecha(retrabajo.creadoEn)} {formatearHora(retrabajo.creadoEn)}
                </span>
              </div>
              <p className="mt-1 text-xs text-texto-secundario">
                {retrabajo.materialCodigo} · {formatearNumero(retrabajo.cantidadUsada, 3)} usado
                {retrabajo.cantidadScrap > 0
                  ? ` · ${formatearNumero(retrabajo.cantidadScrap, 3)} merma`
                  : ''}
                {' '}{retrabajo.unidadBase}
              </p>
              <p className="mt-1 text-xs text-texto-secundario">
                {retrabajo.motivo} · {retrabajo.registradoPorNombre}
              </p>
              {retrabajo.notas ? (
                <p className="mt-1 whitespace-pre-line text-xs text-texto-tenue">{retrabajo.notas}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
