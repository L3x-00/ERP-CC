import { describe, expect, it } from 'vitest';

import {
  ayudaLimitePiezas,
  maximoPiezasProceso,
  validarCantidadPiezas,
} from '@/modulos/produccion/utilidades/limites-piezas';

describe('límite de piezas del operador', () => {
  it('usa las piezas pendientes de la orden cuando no hay meta de proceso', () => {
    expect(maximoPiezasProceso({
      metaProcesoId: null,
      cantidadSolicitada: 100,
      cantidadProducida: 40,
    })).toBe(60);
  });

  it('con ruteo respeta la meta y las piezas disponibles del proceso previo', () => {
    expect(maximoPiezasProceso({
      metaProcesoId: 'meta-1',
      pendientePiezas: 30,
      piezasDisponibles: 12,
      cantidadSolicitada: 100,
      cantidadProducida: 40,
    })).toBe(12);

    expect(maximoPiezasProceso({
      metaProcesoId: 'meta-1',
      pendientePiezas: 5,
      piezasDisponibles: 40,
      cantidadSolicitada: 100,
      cantidadProducida: 40,
    })).toBe(5);
  });

  it('nunca devuelve un límite negativo', () => {
    expect(maximoPiezasProceso({
      metaProcesoId: null,
      cantidadSolicitada: 10,
      cantidadProducida: 25,
    })).toBe(0);
  });

  it('rechaza cantidades no enteras o por encima del tope', () => {
    expect(validarCantidadPiezas(1.5, 10)).toContain('número entero');
    expect(validarCantidadPiezas(11, 10)).toBe(
      'No puedes declarar 11 piezas producidas: el máximo permitido es 10.',
    );
    expect(validarCantidadPiezas(10, 10)).toBeNull();
  });

  it('explica el tope con una frase corta', () => {
    expect(ayudaLimitePiezas(10)).toBe('Máximo 10 piezas para esta operación.');
    expect(ayudaLimitePiezas(1)).toBe('Máximo 1 pieza para esta operación.');
    expect(ayudaLimitePiezas(0)).toBe('Esta operación ya no tiene piezas pendientes.');
  });
});
