import type { OrdenConPartidas } from '@/modulos/ordenes/servicios/ordenes-servicio';
import { fechaKpiMexico } from '@/modulos/ordenes/utilidades/fecha-kpi';

export type SesionComparativa = { orden_id: string; estado_sesion: string; motivo_pausa: string | null };
export type EntregaComparativa = { orden_id: string; creado_en: string };
export type CuentaComparativa = {
  orden_id: string; estado: string; monto_total: number; tipo_cambio_origen: number;
};
export type FilaComparativa = {
  ordenId: string;
  folio: string;
  horasEstimadas: number;
  horasReales: number;
  eficiencia: number | null;
  puntual: boolean | null;
  sesiones: number;
  incidencias: number;
  ventaMxn: number | null;
};

/** Una sesión pausada cuenta una incidencia; la entrega se mide por nota final. */
export function compararOrdenes(
  ordenes: readonly OrdenConPartidas[],
  sesiones: readonly SesionComparativa[],
  entregas: readonly EntregaComparativa[],
  cuentas: readonly CuentaComparativa[] | null,
): FilaComparativa[] {
  const sesionesPorOrden = new Map<string, { total: number; pausas: number }>();
  for (const sesion of sesiones) {
    const actual = sesionesPorOrden.get(sesion.orden_id) ?? { total: 0, pausas: 0 };
    actual.total++;
    if (sesion.estado_sesion === 'pausada') actual.pausas++;
    sesionesPorOrden.set(sesion.orden_id, actual);
  }
  const primeraEntrega = new Map<string, string>();
  for (const entrega of entregas) {
    const anterior = primeraEntrega.get(entrega.orden_id);
    if (!anterior || entrega.creado_en < anterior) primeraEntrega.set(entrega.orden_id, entrega.creado_en);
  }
  const ventaPorOrden = new Map<string, number>();
  for (const cuenta of cuentas ?? []) {
    if (cuenta.estado === 'cancelado') continue;
    ventaPorOrden.set(cuenta.orden_id,
      (ventaPorOrden.get(cuenta.orden_id) ?? 0) + cuenta.monto_total * cuenta.tipo_cambio_origen);
  }
  return ordenes.filter(({ orden }) => !orden.esInterna && orden.estado !== 'cancelada')
    .map(({ orden, partidas }) => {
      const estimadas = partidas.reduce((total, partida) => total + partida.tiempoEstimadoMinutos, 0) / 60;
      const reales = partidas.reduce((total, partida) => total + partida.tiempoRealMinutos, 0) / 60;
      const entrega = primeraEntrega.get(orden.id);
      const actividad = sesionesPorOrden.get(orden.id);
      return {
        ordenId: orden.id,
        folio: orden.folio,
        horasEstimadas: estimadas,
        horasReales: reales,
        eficiencia: reales > 0 ? estimadas / reales * 100 : null,
        puntual: entrega ? fechaKpiMexico(entrega) <= orden.fechaCompromiso.slice(0, 10) : null,
        sesiones: actividad?.total ?? 0,
        incidencias: actividad?.pausas ?? 0,
        ventaMxn: cuentas ? ventaPorOrden.get(orden.id) ?? null : null,
      };
    });
}
