import type { EstadoOrden } from '@/modulos/ordenes/tipos/ordenes';
import type { EstadoSiiOrden } from '@/modulos/ordenes/tipos/orden-sii';
import type { EstadoKanbanProduccion } from '@/modulos/produccion/tipos/indice';

/**
 * Estados que significan que la orden ya no tiene trabajo de piso pendiente.
 * `PRODUCCION_COMPLETADA` y `CERRADA` son los estados SII terminales; el legacy
 * `completada` se conserva para órdenes anteriores al puente de estados.
 */
export const ESTADOS_ORDEN_CONCLUIDA: readonly EstadoOrden[] = ['completada'];
export const ESTADOS_SII_ORDEN_CONCLUIDA: readonly EstadoSiiOrden[] = [
  'PRODUCCION_COMPLETADA',
  'CERRADA',
];

export interface EstadoOrdenConcluible {
  estado?: EstadoOrden | null;
  estadoSii?: EstadoSiiOrden | null;
}

/** Una orden concluida ya no se programa ni se opera; solo se consulta y se entrega. */
export function ordenConcluida(orden: EstadoOrdenConcluible): boolean {
  return (
    (orden.estado !== null && orden.estado !== undefined
      && ESTADOS_ORDEN_CONCLUIDA.includes(orden.estado))
    || (orden.estadoSii !== null && orden.estadoSii !== undefined
      && ESTADOS_SII_ORDEN_CONCLUIDA.includes(orden.estadoSii))
  );
}

/**
 * Una operación puede estar concluida sin que la orden completa lo esté (otras
 * partidas siguen en piso). En ambos casos reprogramarla carece de sentido.
 */
export function operacionConcluida(programacion: {
  estadoPlaneacion: string;
  ordenEstado?: EstadoOrden | null;
  ordenEstadoSii?: EstadoSiiOrden | null;
}): boolean {
  return (
    programacion.estadoPlaneacion === 'completada'
    || ordenConcluida({
      estado: programacion.ordenEstado,
      estadoSii: programacion.ordenEstadoSii,
    })
  );
}

/** Columnas del Kanban que representan trabajo terminado en piso. */
export function trabajoEnPisoConcluido(estado: EstadoKanbanProduccion): boolean {
  return estado === 'lista' || estado === 'entregada';
}
