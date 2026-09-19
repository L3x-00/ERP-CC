import { describe, expect, it } from 'vitest';

import { evaluarCreditoCliente } from '@/modulos/pipeline/servicios/evaluar-credito';

describe('evaluarCreditoCliente (RFQ-16)', () => {
  it('sin límite definido (0 o negativo) nunca bloquea la aprobación', () => {
    const sinLimite = evaluarCreditoCliente({
      limiteCredito: 0,
      creditoUtilizadoMxn: 50_000,
      montoCotizadoMxn: 10_000,
    });
    expect(sinLimite.excedeLimite).toBe(false);
    expect(sinLimite.excedenteMxn).toBe(0);
  });

  it('no bloquea cuando la exposición cabe exactamente en el límite', () => {
    const dentro = evaluarCreditoCliente({
      limiteCredito: 10_000,
      creditoUtilizadoMxn: 7_680,
      montoCotizadoMxn: 2_320,
    });
    expect(dentro.excedeLimite).toBe(false);
    expect(dentro.excedenteMxn).toBe(0);
  });

  it('bloquea y reporta el excedente cuando la cartera más la cotización supera el límite', () => {
    const excedido = evaluarCreditoCliente({
      limiteCredito: 10_000,
      creditoUtilizadoMxn: 10_000,
      montoCotizadoMxn: 2_320,
    });
    expect(excedido.excedeLimite).toBe(true);
    expect(excedido.excedenteMxn).toBe(2_320);
  });

  it('ignora valores no finitos en lugar de romper la aprobación', () => {
    const raro = evaluarCreditoCliente({
      limiteCredito: 5_000,
      creditoUtilizadoMxn: Number.NaN,
      montoCotizadoMxn: 1_000,
    });
    expect(raro.excedeLimite).toBe(false);
    expect(raro.utilizadoMxn).toBe(0);
  });
});
