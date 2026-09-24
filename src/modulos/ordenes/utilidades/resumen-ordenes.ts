import type { OrdenConPartidas } from '@/modulos/ordenes/servicios/ordenes-servicio';
import { fechaKpiMexico } from '@/modulos/ordenes/utilidades/fecha-kpi';

export type ResumenOrdenes = {
  total: number;
  enProceso: number;
  atrasadas: number;
  entregadas: number;
  tiMes: number;
  tiEnProceso: number;
  tiHorasAcumuladas: number;
};

/** Los trabajos entregados requieren nota final; completar producción no equivale a entregar. */
export function resumirOrdenes(
  ordenes: readonly OrdenConPartidas[],
  ordenesConEntregaFinal: ReadonlySet<string>,
  hoy: string,
): ResumenOrdenes {
  const mesActual = hoy.slice(0, 7);
  const resumen: ResumenOrdenes = {
    total: 0, enProceso: 0, atrasadas: 0, entregadas: 0,
    tiMes: 0, tiEnProceso: 0, tiHorasAcumuladas: 0,
  };
  for (const { orden, partidas } of ordenes) {
    if (orden.estado === 'cancelada') continue;
    resumen.total++;
    if (orden.estado === 'en_proceso') resumen.enProceso++;
    if (orden.fechaCompromiso.slice(0, 10) < hoy
      && !ordenesConEntregaFinal.has(orden.id)) resumen.atrasadas++;
    if (ordenesConEntregaFinal.has(orden.id)) resumen.entregadas++;
    if (orden.esInterna) {
      if (fechaKpiMexico(orden.creadoEn).slice(0, 7) === mesActual) resumen.tiMes++;
      if (orden.estado === 'en_proceso') resumen.tiEnProceso++;
      resumen.tiHorasAcumuladas += partidas.reduce(
        (minutos, partida) => minutos + partida.tiempoRealMinutos, 0,
      ) / 60;
    }
  }
  return resumen;
}
