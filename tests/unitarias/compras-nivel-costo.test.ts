import { describe, expect, it } from 'vitest';

import {
  ETIQUETA_RUBRO_COSTO_COMPRA,
  RUBROS_COSTO_COMPRA,
  nivelDeCostoCompra,
} from '@/modulos/compras/utilidades/indice';
import { ESTADOS_COMPRA } from '@/modulos/compras/tipos/indice';

/**
 * Tabla de casos compartida con la conciliación SQL de C10.2 (F-02). La
 * recepción es explícita: una PAGADA directa desde CONFIRMADA no es real.
 */
const CASOS: ReadonlyArray<
  readonly [estado: (typeof ESTADOS_COMPRA)[number], recibidaEn: string | null, comprometido: boolean, real: boolean]
> = [
  ['BORRADOR', null, false, false],
  ['CONFIRMADA', null, true, false],
  ['RECIBIDA', '2026-10-19T10:00:00.000Z', true, true],
  ['PAGADA', '2026-10-19T10:00:00.000Z', true, true],
  ['PAGADA', null, true, false],
  ['CANCELADA', null, false, false],
];

describe('nivel de costo de una compra (C10.1/F06 + C10.2/F-02)', () => {
  it('confirmada compromete; recibida y pagada-con-recepción son reales', () => {
    for (const [estado, recibidaEn, comprometido, real] of CASOS) {
      expect(nivelDeCostoCompra(estado, recibidaEn), `${estado}:${recibidaEn}`).toEqual({
        comprometido,
        real,
      });
    }
  });

  it('una PAGADA sin recepción no cuenta como real (F-02)', () => {
    expect(nivelDeCostoCompra('PAGADA', null)).toEqual({ comprometido: true, real: false });
    expect(nivelDeCostoCompra('PAGADA', '2026-10-19T10:00:00.000Z')).toEqual({
      comprometido: true,
      real: true,
    });
  });

  it('expone los tres rubros y sus etiquetas en español', () => {
    expect(RUBROS_COSTO_COMPRA).toEqual(['material', 'subcontratacion', 'gastos_directos']);
    expect(ETIQUETA_RUBRO_COSTO_COMPRA).toEqual({
      material: 'Material',
      subcontratacion: 'Subcontratación',
      gastos_directos: 'Gastos directos',
    });
  });
});
