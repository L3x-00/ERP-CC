import { describe, expect, it } from 'vitest';

import {
  ETIQUETA_RUBRO_COSTO_COMPRA,
  RUBROS_COSTO_COMPRA,
  nivelDeCostoCompra,
} from '@/modulos/compras/utilidades/indice';
import { ESTADOS_COMPRA } from '@/modulos/compras/tipos/indice';

/**
 * Tabla de casos compartida con el pgTAP de T2 (C10.2). Si cambia aquí, debe
 * cambiar la regla SQL de comprometido/real en la misma tanda.
 */
const CASOS: ReadonlyArray<readonly [estado: (typeof ESTADOS_COMPRA)[number], comprometido: boolean, real: boolean]> = [
  ['BORRADOR', false, false],
  ['CONFIRMADA', true, false],
  ['RECIBIDA', true, true],
  ['PAGADA', true, true],
  ['CANCELADA', false, false],
];

describe('nivel de costo de una compra (C10.1/F06, F-02)', () => {
  it('confirmada compromete; recibida y pagada también son reales', () => {
    for (const [estado, comprometido, real] of CASOS) {
      expect(nivelDeCostoCompra(estado), estado).toEqual({ comprometido, real });
    }
  });

  it('pagada sin recepción no existe como estado: PAGADA solo se alcanza tras recibir', () => {
    // El motor de compras solo permite pagar CONFIRMADA/RECIBIDA y deriva PAGADA
    // al saldar; una compra pagada sin recepción no es un estado alcanzable.
    expect(nivelDeCostoCompra('PAGADA')).toEqual({ comprometido: true, real: true });
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
