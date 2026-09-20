import { describe, expect, it } from 'vitest';
import {
  calcularTier,
  descuentoDeTier,
  tierPorConsumo,
} from '@/modulos/clientes/servicios/calcular-tier';
import type { CatalogoTiers } from '@/modulos/clientes/tipos/indice';

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

  it('un tier manual vigente INFERIOR al consumo no perjudica al cliente', () => {
    const r = calcularTier({
      consumo: 320_000, // platino por consumo
      tierManual: 'plata',
      tierManualHasta: '2026-09-01T00:00:00Z', // vigente
      ahora,
    });
    expect(r).toEqual({ tier: 'platino', esManual: false });
  });

  it('un tier manual vigente SUPERIOR al consumo manda', () => {
    const r = calcularTier({
      consumo: 60_000, // plata por consumo
      tierManual: 'oro',
      tierManualHasta: '2026-09-01T00:00:00Z',
      ahora,
    });
    expect(r).toEqual({ tier: 'oro', esManual: true });
  });

  it('manual y consumo iguales: mismo tier, reportado como manual vigente', () => {
    const r = calcularTier({
      consumo: 160_000, // oro por consumo
      tierManual: 'oro',
      tierManualHasta: '2026-09-01T00:00:00Z',
      ahora,
    });
    expect(r).toEqual({ tier: 'oro', esManual: true });
  });

  it('en el instante exacto de vencimiento el manual ya no aplica', () => {
    const vencimiento = '2026-08-07T00:00:00Z';
    expect(
      calcularTier({
        consumo: 60_000,
        tierManual: 'platino',
        tierManualHasta: vencimiento,
        ahora: new Date(vencimiento),
      }),
    ).toEqual({ tier: 'plata', esManual: false });

    // Un milisegundo antes todavía está vigente.
    expect(
      calcularTier({
        consumo: 60_000,
        tierManual: 'platino',
        tierManualHasta: vencimiento,
        ahora: new Date(new Date(vencimiento).getTime() - 1),
      }),
    ).toEqual({ tier: 'platino', esManual: true });
  });

  it('una caducidad no parseable no habilita el tier manual', () => {
    const r = calcularTier({
      consumo: 0,
      tierManual: 'platino',
      tierManualHasta: 'no-es-fecha',
      ahora,
    });
    expect(r).toEqual({ tier: 'bronce', esManual: false });
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

const CATALOGO_CUSTOM: CatalogoTiers = {
  diasManual: 30,
  tiers: {
    bronce: { umbralMxn: 0, descuentoPorcentaje: 1 },
    plata: { umbralMxn: 10_000, descuentoPorcentaje: 4 },
    oro: { umbralMxn: 20_000, descuentoPorcentaje: 6 },
    platino: { umbralMxn: 30_000, descuentoPorcentaje: 9 },
  },
};

describe('catálogo configurable (CFG-08)', () => {
  it('usa umbrales y descuentos del catálogo inyectado', () => {
    expect(tierPorConsumo(9_999, CATALOGO_CUSTOM)).toBe('bronce');
    expect(tierPorConsumo(10_000, CATALOGO_CUSTOM)).toBe('plata');
    expect(tierPorConsumo(29_999, CATALOGO_CUSTOM)).toBe('oro');
    expect(tierPorConsumo(30_000, CATALOGO_CUSTOM)).toBe('platino');
    expect(descuentoDeTier('oro', CATALOGO_CUSTOM)).toBe(6);
  });

  it('sin catálogo conserva los valores de fábrica', () => {
    expect(tierPorConsumo(50_000)).toBe('plata');
    expect(tierPorConsumo(300_000)).toBe('platino');
    expect(descuentoDeTier('platino')).toBe(8);
  });

  it('el tier manual vigente se resuelve con el catálogo inyectado', () => {
    const r = calcularTier({
      consumo: 15_000,
      tierManual: 'plata',
      tierManualHasta: '2026-09-01T00:00:00Z',
      ahora: new Date('2026-08-07T00:00:00Z'),
      catalogo: CATALOGO_CUSTOM,
    });
    expect(r).toEqual({ tier: 'plata', esManual: true });
  });
});
