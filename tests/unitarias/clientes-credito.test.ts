import { describe, expect, it } from 'vitest';
import { verificarCredito } from '@/modulos/clientes/servicios/verificar-credito';

describe('verificarCredito', () => {
  it('crédito dentro del límite: no excedido', () => {
    const r = verificarCredito({ limite: 100_000, saldoAFavor: 0, usado: 80_000 });
    expect(r.disponible).toBe(20_000);
    expect(r.excedido).toBe(false);
  });

  it('crédito sobrepasado: excedido y disponible negativo', () => {
    const r = verificarCredito({ limite: 100_000, saldoAFavor: 0, usado: 120_000 });
    expect(r.disponible).toBe(-20_000);
    expect(r.excedido).toBe(true);
  });

  it('el saldo a favor suma al crédito disponible', () => {
    const r = verificarCredito({ limite: 100_000, saldoAFavor: 50_000, usado: 120_000 });
    expect(r.disponible).toBe(30_000);
    expect(r.excedido).toBe(false);
  });

  it('justo en el límite no está excedido', () => {
    const r = verificarCredito({ limite: 100_000, saldoAFavor: 0, usado: 100_000 });
    expect(r.disponible).toBe(0);
    expect(r.excedido).toBe(false);
  });

  it('sanea entradas negativas o inválidas a 0', () => {
    const r = verificarCredito({ limite: -5, saldoAFavor: Number.NaN, usado: -10 });
    expect(r).toEqual({ limite: 0, saldoAFavor: 0, usado: 0, disponible: 0, excedido: false });
  });
});
