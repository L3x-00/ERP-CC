import { describe, expect, it } from 'vitest';
import {
  calcularTier,
  descuentoDeTier,
  tierPorConsumo,
} from '@/modulos/clientes/servicios/calcular-tier';

describe('tierPorConsumo', () => {
  it('asigna el tier por umbral acumulado', () => {
    expect(tierPorConsumo(0)).toBe('bronce');
    expect(tierPorConsumo(49_999)).toBe('bronce');
    expect(tierPorConsumo(50_000)).toBe('plata');
    expect(tierPorConsumo(149_999)).toBe('plata');
    expect(tierPorConsumo(150_000)).toBe('oro');
    expect(tierPorConsumo(299_999)).toBe('oro');
    expect(tierPorConsumo(300_000)).toBe('platino');
    expect(tierPorConsumo(5_000_000)).toBe('platino');
  });

  it('sanea consumos inválidos a bronce', () => {
    expect(tierPorConsumo(-100)).toBe('bronce');
    expect(tierPorConsumo(Number.NaN)).toBe('bronce');
  });
});

describe('descuentoDeTier', () => {
  it('mapea cada tier a su descuento', () => {
    expect(descuentoDeTier('bronce')).toBe(0);
    expect(descuentoDeTier('plata')).toBe(3);
    expect(descuentoDeTier('oro')).toBe(5);
    expect(descuentoDeTier('platino')).toBe(8);
  });
});

describe('calcularTier', () => {
  const ahora = new Date('2026-08-07T00:00:00Z');

  it('el tier manual vigente manda sobre el consumo', () => {
    const r = calcularTier({
      consumo: 0, // por consumo sería bronce
      tierManual: 'platino',
      tierManualHasta: '2026-09-01T00:00:00Z', // futuro
      ahora,
    });
    expect(r).toEqual({ tier: 'platino', esManual: true });
  });

  it('el tier manual vencido cae al automático por consumo', () => {
    const r = calcularTier({
      consumo: 160_000, // oro
      tierManual: 'platino',
      tierManualHasta: '2026-07-01T00:00:00Z', // pasado
      ahora,
    });
    expect(r).toEqual({ tier: 'oro', esManual: false });
  });

  it('sin tier manual usa el consumo', () => {
    const r = calcularTier({
      consumo: 60_000, // plata
      tierManual: null,
      tierManualHasta: null,
      ahora,
    });
    expect(r).toEqual({ tier: 'plata', esManual: false });
  });

  it('tier manual sin caducidad no aplica (se ignora)', () => {
    const r = calcularTier({
      consumo: 0,
      tierManual: 'oro',
      tierManualHasta: null,
      ahora,
    });
    expect(r).toEqual({ tier: 'bronce', esManual: false });
  });
});
