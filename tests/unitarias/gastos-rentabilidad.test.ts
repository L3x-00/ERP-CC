import { describe, expect, it } from 'vitest';
import {
  calcularCostoGastosDirectosMxn,
  calcularCostoManoObraMxn,
  calcularCostoMaterialesMxn,
  calcularIngresoMxn,
  calcularMargenPorcentaje,
  calcularRentabilidadOrden,
  convertirAMxn,
} from '@/modulos/gastos/servicios/indice';
import type { Gasto } from '@/modulos/gastos/tipos/indice';

const ORDEN = '11111111-1111-4111-8111-111111111111';
const OTRA_ORDEN = '99999999-9999-4999-8999-999999999999';
const USUARIO = '33333333-3333-4333-8333-333333333333';
let contador = 0;

function gasto(parcial: Partial<Gasto>): Gasto {
  contador += 1;
  return {
    id: `00000000-0000-4000-8000-${String(contador).padStart(12, '0')}`,
    folio: `GTO-${String(contador).padStart(6, '0')}`,
    ordenId: ORDEN,
    ordenFolio: null,
    proveedorId: null,
    categoria: 'maquila_externa',
    descripcion: 'Tratamiento térmico',
    montoSubtotal: 1_000,
    montoIva: 160,
    montoTotal: 1_160,
    moneda: 'MXN',
    tipoCambio: 1,
    estadoPago: 'pendiente',
    fechaGasto: '2026-09-01',
    fechaVencimiento: null,
    comprobanteUrl: null,
    folioComprobante: null,
    metodoPago: 'transferencia',
    datosOcrJson: null,
    notas: null,
    creadoPor: USUARIO,
    creadoEn: '2026-09-01T00:00:00.000Z',
    actualizadoEn: '2026-09-01T00:00:00.000Z',
    ...parcial,
  };
}

describe('conversiones y materiales', () => {
  it('convierte USD y rechaza valores no finitos', () => {
    expect(convertirAMxn(100, 18.5)).toBe(1_850);
    expect(convertirAMxn(100, 0)).toBeNull();
    expect(convertirAMxn(Number.NaN, 1)).toBeNull();
    expect(convertirAMxn(100, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('valúa usada más scrap con el CPP del momento', () => {
    expect(calcularCostoMaterialesMxn([
      { cantidadUsada: 10, cantidadScrap: 2, costoUnitarioMomento: 25.5 },
    ])).toEqual({ costo: 306, considerados: 1 });
  });

  it('suma CPP distinto y descarta cantidades inválidas', () => {
    expect(calcularCostoMaterialesMxn([
      { cantidadUsada: 5, cantidadScrap: 0, costoUnitarioMomento: 10 },
      { cantidadUsada: 3, cantidadScrap: 1, costoUnitarioMomento: 7.25 },
      { cantidadUsada: Number.NaN, cantidadScrap: 1, costoUnitarioMomento: 10 },
    ])).toEqual({ costo: 79, considerados: 2 });
  });
});

describe('mano de obra y gastos', () => {
  it('multiplica horas netas por tarifa histórica y cuenta faltantes', () => {
    expect(calcularCostoManoObraMxn([
      { horasNetas: 7.5, costoHoraInterno: 120 },
      { horasNetas: 2, costoHoraInterno: 95.5 },
      { horasNetas: 1, costoHoraInterno: null },
    ])).toEqual({ costo: 1_091, considerados: 2, sinTarifa: 1 });
  });

  it('suma solo gastos de la orden y excluye cancelados/indirectos', () => {
    expect(calcularCostoGastosDirectosMxn([
      gasto({ montoTotal: 500, montoSubtotal: 500, montoIva: 0 }),
      gasto({ montoTotal: 9_000, montoSubtotal: 9_000, montoIva: 0, estadoPago: 'cancelado' }),
      gasto({ montoTotal: 7_000, montoSubtotal: 7_000, montoIva: 0, ordenId: null }),
      gasto({ montoTotal: 3_000, montoSubtotal: 3_000, montoIva: 0, ordenId: OTRA_ORDEN }),
    ], ORDEN)).toEqual({ costo: 500, considerados: 1, excluidos: 3, incluidos: 0 });
  });

  it('OBS-29: material y nómina no se duplican en el costo directo', () => {
    expect(calcularCostoGastosDirectosMxn([
      gasto({ montoTotal: 2_000, montoSubtotal: 2_000, montoIva: 0, categoria: 'materia_prima' }),
      gasto({ montoTotal: 800, montoSubtotal: 800, montoIva: 0, categoria: 'nomina' }),
      gasto({ montoTotal: 500, montoSubtotal: 500, montoIva: 0, categoria: 'otros' }),
    ], ORDEN)).toEqual({ costo: 500, considerados: 1, excluidos: 0, incluidos: 2 });

    const resultado = calcularRentabilidadOrden({
      ordenId: ORDEN,
      ingreso: { montoTotal: 10_000, moneda: 'MXN', tipoCambio: 1 },
      materiales: [{ cantidadUsada: 100, cantidadScrap: 0, costoUnitarioMomento: 30 }],
      sesiones: [{ horasNetas: 20, costoHoraInterno: 100 }],
      gastos: [
        gasto({ montoTotal: 1_000, montoSubtotal: 1_000, montoIva: 0, categoria: 'materia_prima' }),
        gasto({ montoTotal: 1_000, montoSubtotal: 1_000, montoIva: 0, categoria: 'otros' }),
      ],
    });
    // 3000 material + 2000 mano de obra + 1000 gasto directo = 6000; utilidad 4000; margen 40 %.
    expect(resultado.costoTotalMxn).toBe(6_000);
    expect(resultado.utilidadBrutaMxn).toBe(4_000);
    expect(resultado.margenPorcentaje).toBe(40);
    expect(resultado.gastosIncluidosEnRubros).toBe(1);
  });
});

describe('margen y rentabilidad', () => {
  it('calcula ingreso explícito de CxC en MXN y margen', () => {
    expect(calcularIngresoMxn({ montoTotal: 1_000, moneda: 'USD', tipoCambio: 18.5 })).toBe(18_500);
    expect(calcularIngresoMxn({ montoTotal: 1_000, moneda: 'MXN', tipoCambio: 1.1 })).toBeNull();
    expect(calcularMargenPorcentaje(2_500, 10_000)).toBe(25);
    expect(calcularMargenPorcentaje(500, 0)).toBeNull();
  });

  it('agrega los cuatro componentes con merma y redondeo', () => {
    const resultado = calcularRentabilidadOrden({
      ordenId: ORDEN,
      ingreso: { montoTotal: 1_000, moneda: 'USD', tipoCambio: 18.5 },
      materiales: [{ cantidadUsada: 100, cantidadScrap: 10, costoUnitarioMomento: 25 }],
      sesiones: [{ horasNetas: 20, costoHoraInterno: 150 }],
      gastos: [gasto({ montoTotal: 1_160 })],
    });
    expect(resultado.ingresoMxn).toBe(18_500);
    expect(resultado.costoMaterialesMxn).toBe(2_750);
    expect(resultado.costoManoObraMxn).toBe(3_000);
    expect(resultado.costoGastosDirectosMxn).toBe(1_160);
    expect(resultado.costoTotalMxn).toBe(6_910);
    expect(resultado.utilidadBrutaMxn).toBe(11_590);
    expect(resultado.margenPorcentaje).toBe(62.65);
    expect(resultado.componentesFaltantes).toEqual([]);
  });

  it('sin CxC devuelve ingreso cero y margen no calculable', () => {
    const resultado = calcularRentabilidadOrden({
      ordenId: ORDEN,
      ingreso: null,
      materiales: [{ cantidadUsada: 4, cantidadScrap: 0, costoUnitarioMomento: 100 }],
      sesiones: [],
      gastos: [],
    });
    expect(resultado.ingresoMxn).toBe(0);
    expect(resultado.utilidadBrutaMxn).toBe(-400);
    expect(resultado.margenPorcentaje).toBeNull();
    expect(resultado.componentesFaltantes).toEqual(['ingreso', 'mano_obra', 'gastos']);
  });

  it('un TI informa su costo de producción sin exigir venta', () => {
    const resultado = calcularRentabilidadOrden({
      ordenId: ORDEN,
      folio: 'OP-001000',
      esInterna: true,
      ingreso: null,
      materiales: [{ cantidadUsada: 4, cantidadScrap: 0, costoUnitarioMomento: 100 }],
      sesiones: [{ horasNetas: 2, costoHoraInterno: 50 }],
      gastos: [gasto({ montoTotal: 232 })],
    });
    expect(resultado.esInterna).toBe(true);
    expect(resultado.folio).toBe('OP-001000');
    expect(resultado.ingresoMxn).toBe(0);
    expect(resultado.costoTotalMxn).toBe(732);
    expect(resultado.margenPorcentaje).toBeNull();
    expect(resultado.componentesFaltantes).toEqual([]);
  });

  it('un TI sin costos reporta los componentes faltantes pero nunca ingreso', () => {
    const resultado = calcularRentabilidadOrden({
      ordenId: ORDEN,
      esInterna: true,
      ingreso: null,
      materiales: [],
      sesiones: [],
      gastos: [],
    });
    expect(resultado.componentesFaltantes).toEqual(['materiales', 'mano_obra', 'gastos']);
  });

  it('nunca propaga NaN o Infinity y es determinista', () => {
    const entrada = {
      ordenId: ORDEN,
      ingreso: { montoTotal: Number.NaN, moneda: 'MXN' as const, tipoCambio: 1 },
      materiales: [{ cantidadUsada: Number.POSITIVE_INFINITY, cantidadScrap: 0, costoUnitarioMomento: 10 }],
      sesiones: [{ horasNetas: Number.NaN, costoHoraInterno: 100 }],
      gastos: [gasto({ montoTotal: 100, montoSubtotal: 100, montoIva: 0, tipoCambio: Number.NaN })],
    };
    const resultado = calcularRentabilidadOrden(entrada);
    for (const valor of [
      resultado.ingresoMxn,
      resultado.costoMaterialesMxn,
      resultado.costoManoObraMxn,
      resultado.costoGastosDirectosMxn,
      resultado.costoTotalMxn,
      resultado.utilidadBrutaMxn,
    ]) expect(Number.isFinite(valor)).toBe(true);
    expect(calcularRentabilidadOrden(entrada)).toEqual(resultado);
  });
});
