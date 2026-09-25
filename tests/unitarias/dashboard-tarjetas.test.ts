import { describe, expect, it } from 'vitest';
import { tarjetasEjecutivas } from '@/modulos/dashboard/servicios/dashboard-servicio';
import {
  mapearMetricasEjecutivas,
  type MetricasEjecutivas,
  type ResumenEjecutivoPeriodo,
} from '@/modulos/dashboard/tipos/indice';

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
      costosReconocidosMxn: 0,
      gastosIncluidosEnRubrosMxn: 0,
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
      totalFacturado: 116_000,
      ventaNetaMxn: 100_000,
      ivaMxn: 16_000,
      ventaSinDesgloseMxn: 0,
      cuentasSinDesglose: 0,
      totalCotizado: 250_000,
      porcentajeConversion: 42,
      tiempoRespuestaHorasPromedio: 6.5,
      porcentajeRespondidas24h: 75,
    },
    { gastosTotal: 40_000, costosReconocidosMxn: 36_000, utilidadNetaAcumulada: 64_000 },
  ),
  anterior: periodo(
    {
      totalFacturado: 92_800,
      ventaNetaMxn: 80_000,
      ivaMxn: 12_800,
      ventaSinDesgloseMxn: 0,
      cuentasSinDesglose: 0,
      totalCotizado: 200_000,
      porcentajeConversion: 35,
      tiempoRespuestaHorasPromedio: 9,
      porcentajeRespondidas24h: 60,
    },
    { gastosTotal: 30_000, costosReconocidosMxn: 28_000, utilidadNetaAcumulada: 52_000 },
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

  it('A03/A04: separa venta neta, costo reconocido y utilidad sobre la base sin IVA', () => {
    const porId = new Map(tarjetasEjecutivas(METRICAS).map((t) => [t.id, t]));

    expect(porId.get('ventas-total-facturado')?.valor).toBe(116_000);
    expect(porId.get('ventas-netas')?.valor).toBe(100_000);
    expect(porId.get('costos-reconocidos')?.valor).toBe(36_000);
    expect(porId.get('utilidad-neta')?.valor).toBe(64_000);
  });

  it('A03: sin desglose de IVA la venta neta y la utilidad salen no calculables', () => {
    const sinDesglose = tarjetasEjecutivas({
      ...METRICAS,
      actual: periodo(
        {
          totalFacturado: 116_000,
          ventaNetaMxn: null,
          ivaMxn: null,
          ventaSinDesgloseMxn: 116_000,
          cuentasSinDesglose: 1,
          totalCotizado: 250_000,
          porcentajeConversion: 42,
          tiempoRespuestaHorasPromedio: 6.5,
          porcentajeRespondidas24h: 75,
        },
        { utilidadNetaAcumulada: null, margenPromedioPorcentaje: null },
      ),
    });
    const porId = new Map(sinDesglose.map((t) => [t.id, t]));

    expect(porId.get('ventas-netas')?.valor).toBe('—');
    expect(porId.get('ventas-netas')?.descripcion).toContain('sin desglose');
    expect(porId.get('utilidad-neta')?.valor).toBe('—');
    expect(porId.get('margen-promedio')?.valor).toBe('—');
    // El importe facturado sigue disponible: el dato existe, lo que falta es su base.
    expect(porId.get('ventas-total-facturado')?.valor).toBe(116_000);
  });

  it('expone el costo de producción TI del periodo cuando la RPC lo entrega (OBS-29)', () => {
    const conCosto = tarjetasEjecutivas({
      ...METRICAS,
      costoTi: {
        actual: {
          costoMaterialesMxn: 100,
          costoManoObraMxn: 200,
          costoGastosMxn: 50,
          costoTotalMxn: 350,
          ordenesInternas: 2,
        },
        anterior: {
          costoMaterialesMxn: 0,
          costoManoObraMxn: 0,
          costoGastosMxn: 0,
          costoTotalMxn: 0,
          ordenesInternas: 0,
        },
      },
    });
    const porId = new Map(conCosto.map((t) => [t.id, t]));
    expect(porId.get('costo-ti-periodo')?.valor).toBe(350);
    expect(porId.get('costo-ti-periodo')?.unidad).toBe('moneda');

    // Sin la RPC (migración pendiente) la tarjeta muestra "—" y no rompe.
    const sinCosto = new Map(tarjetasEjecutivas(METRICAS).map((t) => [t.id, t]));
    expect(sinCosto.get('costo-ti-periodo')?.valor).toBe('—');
  });

  it('A04: con la migración aplicada sí compara periodos conocidos', () => {
    const porId = new Map(tarjetasEjecutivas(METRICAS).map((t) => [t.id, t]));

    const netas = porId.get('ventas-netas');
    expect(netas?.variacionPorcentaje).toBe(25);
    expect(netas?.tendencia).toBe('subio');
  });

  it('A04/H7: con periodo anterior no calculable la tarjeta sale sin comparación', () => {
    const anteriorDesconocido = tarjetasEjecutivas({
      ...METRICAS,
      anterior: periodo(
        {
          totalFacturado: 92_800,
          ventaNetaMxn: null,
          ivaMxn: null,
          ventaSinDesgloseMxn: 92_800,
          cuentasSinDesglose: 1,
          totalCotizado: 200_000,
          porcentajeConversion: 35,
          tiempoRespuestaHorasPromedio: 9,
          porcentajeRespondidas24h: 60,
        },
        { utilidadNetaAcumulada: null, margenPromedioPorcentaje: null },
      ),
    });
    const porId = new Map(anteriorDesconocido.map((t) => [t.id, t]));

    for (const id of ['ventas-netas', 'utilidad-neta', 'margen-promedio']) {
      const tarjeta = porId.get(id);
      // El valor actual sigue siendo el real; lo que no existe es la base a comparar.
      expect(tarjeta?.variacionPorcentaje).toBeNull();
      expect(tarjeta?.tendencia).toBe('neutro');
    }
    expect(porId.get('ventas-netas')?.valor).toBe(100_000);
    // Las tarjetas con ambos periodos conocidos conservan su comparación.
    expect(porId.get('ventas-total-facturado')?.tendencia).toBe('subio');
  });
});

/** Respuesta del RPC anterior a A04: sin costo reconocido ni base sin IVA. */
function respuestaRpcAnterior(): unknown {
  const bloque = {
    ventas: {
      totalFacturado: 116_000,
      totalCotizado: 250_000,
      porcentajeConversion: 42,
      tiempoRespuestaHorasPromedio: 6.5,
      porcentajeRespondidas24h: 75,
    },
    ordenes: {
      activas: 3,
      completadas: 5,
      aprobacionesPendientes: 1,
      internas: 4,
      atrasadas: 2,
      enRiesgo: 0,
    },
    finanzas: {
      arPendiente: 0,
      arVencido: 0,
      cxpPendiente: 0,
      gastosTotal: 40_000,
      // Calculada sobre venta bruta (con IVA) por el RPC anterior.
      utilidadNetaAcumulada: 80_000,
      margenPromedioPorcentaje: 68.97,
    },
  };
  return {
    version: 1,
    periodo: { inicio: 'a', fin: 'b', anteriorInicio: 'c', anteriorFin: 'd' },
    actual: bloque,
    anterior: bloque,
    generadoEn: '2026-09-15T00:00:00.000Z',
  };
}

describe('mapearMetricasEjecutivas sin la migración A04 aplicada', () => {
  it('H2: el costo reconocido ausente es null, nunca 0', () => {
    const metricas = mapearMetricasEjecutivas(respuestaRpcAnterior());

    expect(metricas.actual.finanzas.costosReconocidosMxn).toBeNull();
    expect(metricas.actual.finanzas.gastosTotal).toBe(40_000);

    const porId = new Map(tarjetasEjecutivas(metricas).map((t) => [t.id, t]));
    expect(porId.get('costos-reconocidos')?.valor).toBe('—');
    expect(porId.get('costos-reconocidos')?.variacionPorcentaje).toBeNull();
  });

  it('no publica la utilidad bruta del RPC anterior como utilidad neta', () => {
    const metricas = mapearMetricasEjecutivas(respuestaRpcAnterior());

    expect(metricas.actual.finanzas.utilidadNetaAcumulada).toBeNull();
    expect(metricas.actual.finanzas.margenPromedioPorcentaje).toBeNull();

    const porId = new Map(tarjetasEjecutivas(metricas).map((t) => [t.id, t]));
    expect(porId.get('utilidad-neta')?.valor).toBe('—');
    expect(porId.get('margen-promedio')?.valor).toBe('—');
    // El importe facturado sí es un dato real del RPC anterior y sigue visible.
    expect(porId.get('ventas-total-facturado')?.valor).toBe(116_000);
    expect(porId.get('ventas-netas')?.valor).toBe('—');
  });
});
