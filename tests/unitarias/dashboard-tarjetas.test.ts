import { describe, expect, it } from 'vitest';
import { tarjetasEjecutivas } from '@/modulos/dashboard/servicios/dashboard-servicio';
import type { MetricasEjecutivas, ResumenEjecutivoPeriodo } from '@/modulos/dashboard/tipos/indice';

function periodo(
  ventas: ResumenEjecutivoPeriodo['ventas'],
  finanzasParcial?: Partial<ResumenEjecutivoPeriodo['finanzas']>,
): ResumenEjecutivoPeriodo {
  return {
    ventas,
    ordenes: { activas: 3, completadas: 5, aprobacionesPendientes: 1, internas: 4, atrasadas: 2, enRiesgo: 0 },
    finanzas: {
      arPendiente: 0,
      arVencido: 0,
      cxpPendiente: 0,
      gastosTotal: 0,
      utilidadNetaAcumulada: 0,
      margenPromedioPorcentaje: 10,
      ...finanzasParcial,
    },
    distribucionGastoPorCategoria: [],
  };
}

const METRICAS: MetricasEjecutivas = {
  version: 1,
  periodo: { inicio: 'a', fin: 'b', anteriorInicio: 'c', anteriorFin: 'd' },
  actual: periodo(
    {
      totalFacturado: 100_000,
      totalCotizado: 250_000,
      porcentajeConversion: 42,
      tiempoRespuestaHorasPromedio: 6.5,
      porcentajeRespondidas24h: 75,
    },
    { gastosTotal: 40_000 },
  ),
  anterior: periodo(
    {
      totalFacturado: 80_000,
      totalCotizado: 200_000,
      porcentajeConversion: 35,
      tiempoRespuestaHorasPromedio: 9,
      porcentajeRespondidas24h: 60,
    },
    { gastosTotal: 30_000 },
  ),
  generadoEn: '2026-09-15T00:00:00.000Z',
};

describe('tarjetasEjecutivas', () => {
  it('expone conversión de pipeline y pipeline activo desde datos existentes (DAS-05/DAS-01)', () => {
    const tarjetas = tarjetasEjecutivas(METRICAS);
    const porId = new Map(tarjetas.map((t) => [t.id, t]));

    const conversion = porId.get('conversion-pipeline');
    expect(conversion?.valor).toBe(42);
    expect(conversion?.unidad).toBe('porcentaje');
    expect(conversion?.descripcion).toContain('80%');

    const pipeline = porId.get('pipeline-activo');
    expect(pipeline?.valor).toBe(250_000);
    expect(pipeline?.unidad).toBe('moneda');
  });

  it('expone tiempo de respuesta y % respondidas en 24 h (DAS-05 resto)', () => {
    const porId = new Map(tarjetasEjecutivas(METRICAS).map((t) => [t.id, t]));

    const respuesta = porId.get('tiempo-respuesta-cotizacion');
    expect(respuesta?.valor).toBe(6.5);
    expect(respuesta?.unidad).toBe('cantidad');

    const veinticuatro = porId.get('respondidas-24h');
    expect(veinticuatro?.valor).toBe(75);
    expect(veinticuatro?.unidad).toBe('porcentaje');
  });

  it('expone el gasto total del periodo como tarjeta de moneda (DAS-02)', () => {
    const porId = new Map(tarjetasEjecutivas(METRICAS).map((t) => [t.id, t]));

    const gastos = porId.get('gastos-periodo');
    expect(gastos?.valor).toBe(40_000);
    expect(gastos?.unidad).toBe('moneda');
  });

  it('cuenta las órdenes internas (TI) por separado (DAS-01)', () => {
    const porId = new Map(tarjetasEjecutivas(METRICAS).map((t) => [t.id, t]));

    const internas = porId.get('ordenes-internas-ti');
    expect(internas?.valor).toBe(4);
    expect(internas?.unidad).toBe('cantidad');
  });
});
