import { describe, expect, it } from 'vitest';
import { resumirOrdenes } from '@/modulos/ordenes/utilidades/resumen-ordenes';
import type { OrdenConPartidas } from '@/modulos/ordenes/servicios/ordenes-servicio';
import { ESTADO_SII_A_LEGACY, type EstadoSiiOrden } from '@/modulos/ordenes/tipos/orden-sii';
import type { Orden, Partida } from '@/modulos/ordenes/tipos/ordenes';

function trabajo(
  id: string, estadoSii: EstadoSiiOrden, compromiso: string,
  interna: boolean, creado: string, minutos: number,
): OrdenConPartidas {
  return {
    orden: {
      id, estado: ESTADO_SII_A_LEGACY[estadoSii], estadoSii,
      fechaCompromiso: compromiso, esInterna: interna, creadoEn: creado,
    } as Orden,
    partidas: [{ tiempoRealMinutos: minutos } as Partida],
  };
}

describe('resumen operativo de órdenes', () => {
  // O-06 A (cliente, 2026-10-15): la puntualidad se mide contra el compromiso comercial; la fecha
  // operativa (espejo en `fechaCompromiso`) puede reprogramarse sin mover la promesa original.
  it('cuenta como atrasada una orden vencida en su compromiso comercial aunque Planeación la reprogramó', () => {
    const reprogramada = trabajo('reprogramada', 'EN_PRODUCCION', '2026-09-30T18:00:00Z', false, '2026-09-01', 0);
    reprogramada.orden.fechaCompromisoComercial = '2026-09-10';
    expect(resumirOrdenes([reprogramada], new Set(), '2026-09-23').atrasadas).toBe(1);
  });
  it('no cuenta como atrasada una orden dentro de su compromiso comercial aunque la fecha operativa ya pasó', () => {
    const adelantada = trabajo('adelantada', 'EN_PRODUCCION', '2026-09-10T18:00:00Z', false, '2026-09-01', 0);
    adelantada.orden.fechaCompromisoComercial = '2026-10-05';
    expect(resumirOrdenes([adelantada], new Set(), '2026-09-23').atrasadas).toBe(0);
  });
  it('sin compromiso comercial (interna o anterior al flujo SII) usa la fecha que tenga', () => {
    const sinComercial = trabajo('sin-comercial', 'EN_PRODUCCION', '2026-09-10T18:00:00Z', false, '2026-09-01', 0);
    sinComercial.orden.fechaCompromisoComercial = null;
    expect(resumirOrdenes([sinComercial], new Set(), '2026-09-23').atrasadas).toBe(1);
  });
  it('atribuye una TI al mes de México en el borde UTC', () => {
    const resumen = resumirOrdenes([
      trabajo('ti-borde', 'EN_PRODUCCION', '2026-10-15', true, '2026-10-01T02:00:00Z', 0),
    ], new Set(), '2026-09-30');
    expect(resumen.tiMes).toBe(1);
  });
  it('separa entrega final de producción completada y suma las horas TI sin duplicar', () => {
    const trabajos = [
      trabajo('ti-actual', 'EN_PRODUCCION', '2026-09-20', true, '2026-09-02', 90),
      trabajo('comercial-vencida', 'EN_PRODUCCION', '2026-09-10', false, '2026-09-01', 120),
      trabajo('comercial-lista', 'PRODUCCION_COMPLETADA', '2026-09-15', false, '2026-09-01', 30),
      trabajo('ti-anterior', 'PRODUCCION_COMPLETADA', '2026-08-14', true, '2026-08-01', 30),
      trabajo('cancelada', 'CANCELADA', '2026-08-01', false, '2026-08-01', 0),
    ];
    expect(resumirOrdenes(trabajos, new Set(['comercial-lista']), '2026-09-23')).toEqual({
      total: 4,
      enProceso: 2,
      atrasadas: 3,
      entregadas: 1,
      tiMes: 1,
      tiEnProceso: 1,
      tiHorasAcumuladas: 2,
    });
  });
});
