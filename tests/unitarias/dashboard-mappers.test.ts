import { describe, expect, it } from 'vitest';
import {
  mapearMetricasEjecutivas,
  mapearMetricasVendedor,
} from '@/modulos/dashboard/tipos/indice';

const periodo = {
  inicio: '2026-09-01T00:00:00.000Z',
  fin: '2026-10-01T00:00:00.000Z',
  anteriorInicio: '2026-08-02T00:00:00.000Z',
  anteriorFin: '2026-09-01T00:00:00.000Z',
};

const ordenes = {
  activas: 2,
  completadas: 1,
  aprobacionesPendientes: 1,
  atrasadas: 0,
  enRiesgo: 1,
};

const finanzas = {
  arPendiente: 1200,
  arVencido: 300,
  cxpPendiente: 800,
  utilidadNetaAcumulada: 400,
  margenPromedioPorcentaje: 33.3333,
};

describe('mappers del dashboard', () => {
  it('mapea métricas ejecutivas y descarta campos no contractuales', () => {
    const resultado = mapearMetricasEjecutivas({
      version: 1,
      periodo,
      actual: {
        ventas: { totalFacturado: 1000, totalCotizado: 2000, porcentajeConversion: 50 },
        ordenes,
        finanzas,
        campoInterno: 'no debe cruzar',
      },
      anterior: {
        ventas: { totalFacturado: 800, totalCotizado: 1500, porcentajeConversion: 40 },
        ordenes,
        finanzas: { ...finanzas, margenPromedioPorcentaje: null },
      },
      generadoEn: '2026-10-01T00:00:00.000Z',
      secreto: 'no debe cruzar',
    });

    expect(resultado.actual.ordenes.aprobacionesPendientes).toBe(1);
    expect(resultado).not.toHaveProperty('secreto');
    expect(resultado.actual).not.toHaveProperty('campoInterno');
  });

  it('rechaza números no finitos en la respuesta del RPC', () => {
    expect(() => mapearMetricasEjecutivas({
      version: 1,
      periodo,
      actual: {
        ventas: { totalFacturado: Number.NaN, totalCotizado: 0, porcentajeConversion: 0 },
        ordenes,
        finanzas,
      },
      anterior: {
        ventas: { totalFacturado: 0, totalCotizado: 0, porcentajeConversion: 0 },
        ordenes,
        finanzas,
      },
      generadoEn: '2026-10-01T00:00:00.000Z',
    })).toThrow(/Número inválido/);
  });

  it('aplica defaults cuando el RPC aún no envía las métricas nuevas (compatibilidad)', () => {
    // Payload "viejo": sin tiempoRespuesta/porcentajeRespondidas24h/gastosTotal ni distribución.
    const resultado = mapearMetricasEjecutivas({
      version: 1,
      periodo,
      actual: {
        ventas: { totalFacturado: 1000, totalCotizado: 2000, porcentajeConversion: 50 },
        ordenes,
        finanzas,
      },
      anterior: {
        ventas: { totalFacturado: 800, totalCotizado: 1500, porcentajeConversion: 40 },
        ordenes,
        finanzas,
      },
      generadoEn: '2026-10-01T00:00:00.000Z',
    });

    expect(resultado.actual.ventas.tiempoRespuestaHorasPromedio).toBe(0);
    expect(resultado.actual.ventas.porcentajeRespondidas24h).toBe(0);
    expect(resultado.actual.finanzas.gastosTotal).toBe(0);
    expect(resultado.actual.ordenes.internas).toBe(0);
    expect(resultado.actual.distribucionGastoPorCategoria).toEqual([]);
  });

  it('mapea las métricas nuevas y descarta renglones de distribución malformados (DAS-05/02/06)', () => {
    const resultado = mapearMetricasEjecutivas({
      version: 1,
      periodo,
      actual: {
        ventas: {
          totalFacturado: 1000,
          totalCotizado: 2000,
          porcentajeConversion: 50,
          tiempoRespuestaHorasPromedio: 6.5,
          porcentajeRespondidas24h: 80,
        },
        ordenes,
        finanzas: { ...finanzas, gastosTotal: 40_000 },
        distribucionGastoPorCategoria: [
          { categoria: 'materia_prima', montoMxn: 25_000 },
          { categoria: 'nomina', montoMxn: 15_000 },
          { categoria: '', montoMxn: 999 },
          { categoria: 'otros', montoMxn: Number.NaN },
          { montoMxn: 5 },
          'basura',
        ],
      },
      anterior: {
        ventas: {
          totalFacturado: 800,
          totalCotizado: 1500,
          porcentajeConversion: 40,
          tiempoRespuestaHorasPromedio: 9,
          porcentajeRespondidas24h: 60,
        },
        ordenes,
        finanzas: { ...finanzas, gastosTotal: 30_000 },
        distribucionGastoPorCategoria: [],
      },
      generadoEn: '2026-10-01T00:00:00.000Z',
    });

    expect(resultado.actual.ventas.tiempoRespuestaHorasPromedio).toBe(6.5);
    expect(resultado.actual.ventas.porcentajeRespondidas24h).toBe(80);
    expect(resultado.actual.finanzas.gastosTotal).toBe(40_000);
    expect(resultado.actual.distribucionGastoPorCategoria).toEqual([
      { categoria: 'materia_prima', montoMxn: 25_000 },
      { categoria: 'nomina', montoMxn: 15_000 },
    ]);
  });

  it('mantiene el alcance exclusivo del vendedor y exige su identificador', () => {
    const resumen = {
      pipelinePorEtapa: {
        prospecto: 1,
        contactado: 0,
        cotizado: 2,
        negociacion: 0,
        ganada: 1,
        perdida: 0,
      },
      cotizacionesSinSeguimiento: 1,
      metaMensual: { metaMxn: 10000, realMxn: 2500, porcentajeCumplimiento: 25 },
      comisionAcumuladaMxn: 125,
    };
    const resultado = mapearMetricasVendedor({
      version: 1,
      usuarioId: '10000000-0000-4000-8000-000000000001',
      periodo,
      actual: resumen,
      anterior: resumen,
      generadoEn: '2026-10-01T00:00:00.000Z',
    });

    expect(resultado.usuarioId).toBe('10000000-0000-4000-8000-000000000001');
    expect(() => mapearMetricasVendedor({ version: 1, periodo, actual: resumen, anterior: resumen })).toThrow(/usuarioId/);
  });
});
