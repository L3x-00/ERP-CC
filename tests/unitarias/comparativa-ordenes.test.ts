import { describe, expect, it } from 'vitest';
import { compararOrdenes } from '@/modulos/ordenes/utilidades/comparativa-ordenes';
import type { OrdenConPartidas } from '@/modulos/ordenes/servicios/ordenes-servicio';
import type { Orden, Partida } from '@/modulos/ordenes/tipos/ordenes';

const ordenes: OrdenConPartidas[] = [{
  orden: {
    id: 'op-1', folio: 'OP-000001', estado: 'completada', esInterna: false,
    fechaCompromiso: '2026-09-20T23:59:59Z',
  } as Orden,
  partidas: [
    { tiempoEstimadoMinutos: 120, tiempoRealMinutos: 45 } as Partida,
    { tiempoEstimadoMinutos: 60, tiempoRealMinutos: 15 } as Partida,
  ],
}, {
  orden: { id: 'ti-1', estado: 'completada', esInterna: true } as Orden,
  partidas: [],
}];

describe('comparativa KPI', () => {
  it('agrega por orden sin multiplicar ventas por sesiones y usa entrega final', () => {
    const filas = compararOrdenes(ordenes,
      [
        { orden_id: 'op-1', estado_sesion: 'pausada', motivo_pausa: 'material_pendiente' },
        { orden_id: 'op-1', estado_sesion: 'finalizada', motivo_pausa: null },
      ],
      [{ orden_id: 'op-1', creado_en: '2026-09-21T08:00:00Z' }],
      [
        { orden_id: 'op-1', estado: 'pendiente', monto_total: 100, tipo_cambio_origen: 18 },
        { orden_id: 'op-1', estado: 'cancelado', monto_total: 50, tipo_cambio_origen: 1 },
      ]);
    expect(filas).toEqual([{
      ordenId: 'op-1', folio: 'OP-000001', horasEstimadas: 3, horasReales: 1,
      eficiencia: 300, puntual: false, sesiones: 2, incidencias: 1, ventaMxn: 1800,
    }]);
  });

  it('distingue falta de venta autorizada, tiempo y entrega de valores cero', () => {
    const filas = compararOrdenes([{
      ...ordenes[0], partidas: [{ tiempoEstimadoMinutos: 60, tiempoRealMinutos: 0 } as Partida],
    }], [], [], null);
    expect(filas[0]).toMatchObject({ eficiencia: null, puntual: null, ventaMxn: null });
  });

  it('evalúa puntualidad en la fecha operativa mexicana', () => {
    const filas = compararOrdenes(ordenes, [],
      [{ orden_id: 'op-1', creado_en: '2026-09-21T02:00:00Z' }], []);
    expect(filas[0]?.puntual).toBe(true);
  });
});
