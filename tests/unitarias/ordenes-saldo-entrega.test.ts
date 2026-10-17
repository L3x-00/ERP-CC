import { describe, expect, it } from 'vitest';

import { calcularSaldoEntrega } from '@/modulos/ordenes/utilidades/entrega-orden';

describe('calcularSaldoEntrega (R12, espejo del cierre SQL 20261007120002:201-212)', () => {
  it('50/50 solicitud con 30 entregado → faltan 20 y cierre no permitido', () => {
    const saldo = calcularSaldoEntrega([
      { cantidadSolicitada: 50, cantidadProducida: 50, cantidadEntregada: 30 },
    ]);
    expect(saldo).toMatchObject({
      solicitado: 50,
      entregado: 30,
      faltan: 20,
      cierrePermitido: false,
      requiereDecisionFaltante: false,
    });
  });

  it('50/50 solicitud con 50 entregados → faltan 0 y cierre permitido', () => {
    const saldo = calcularSaldoEntrega([
      { cantidadSolicitada: 50, cantidadProducida: 50, cantidadEntregada: 50 },
    ]);
    expect(saldo).toMatchObject({ faltan: 0, cierrePermitido: true, requiereDecisionFaltante: false });
  });

  it('suma el entregado acumulado de varias partidas (regla por partida del SQL)', () => {
    const saldo = calcularSaldoEntrega([
      { cantidadSolicitada: 30, cantidadProducida: 30, cantidadEntregada: 30 },
      { cantidadSolicitada: 20, cantidadProducida: 20, cantidadEntregada: 5 },
    ]);
    expect(saldo).toMatchObject({ solicitado: 50, entregado: 35, faltan: 15, cierrePermitido: false });
  });

  it('scrap: producido < solicitado con todo lo producido entregado → se marca decisión del PO', () => {
    const saldo = calcularSaldoEntrega([
      { cantidadSolicitada: 50, cantidadProducida: 30, cantidadEntregada: 30 },
    ]);
    expect(saldo.faltan).toBe(20);
    expect(saldo.cierrePermitido).toBe(false);
    expect(saldo.requiereDecisionFaltante).toBe(true);
  });

  it('scrap pendiente de entregar lo producido → el faltante se pide normal (no decisión del PO)', () => {
    const saldo = calcularSaldoEntrega([
      { cantidadSolicitada: 50, cantidadProducida: 30, cantidadEntregada: 10 },
    ]);
    expect(saldo.faltan).toBe(40);
    expect(saldo.cierrePermitido).toBe(false);
    expect(saldo.requiereDecisionFaltante).toBe(false);
  });

  it('sin entregas registradas cuenta cero', () => {
    const saldo = calcularSaldoEntrega([{ cantidadSolicitada: 10, cantidadProducida: 10 }]);
    expect(saldo).toMatchObject({ entregado: 0, faltan: 10, cierrePermitido: false });
  });
});
