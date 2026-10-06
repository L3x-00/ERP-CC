import { describe, expect, it } from 'vitest';

import {
  agruparPendientesPorItem,
  totalPendiente,
} from '@/modulos/entregas/servicios/agrupar-pendientes';
import type { PartidaPendiente } from '@/modulos/entregas/tipos/indice';

function partida(extra: Partial<PartidaPendiente> & { id: string }): PartidaPendiente {
  return {
    codigoItem: 'IT01',
    codigoPieza: 'IT01',
    descripcion: 'Pieza',
    cantidadSolicitada: 10,
    cantidadProducida: 10,
    cantidadEntregada: 0,
    ...extra,
  };
}

describe('agruparPendientesPorItem (SII-B7.1)', () => {
  it('agrupa partidas del mismo ITxx sumando solicitado/producido/entregado', () => {
    const items = agruparPendientesPorItem([
      partida({ id: 'a', cantidadSolicitada: 4, cantidadProducida: 4, cantidadEntregada: 2 }),
      partida({ id: 'b', cantidadSolicitada: 6, cantidadProducida: 5, cantidadEntregada: 1 }),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      codigoItem: 'IT01',
      partidaIds: ['a', 'b'],
      cantidadSolicitada: 10,
      cantidadProducida: 9,
      cantidadEntregada: 3,
      pendiente: 7,
      disponible: 6,
    });
  });

  it('nunca deja pendiente o disponible negativos si se entregó de más', () => {
    const items = agruparPendientesPorItem([
      partida({ id: 'a', cantidadSolicitada: 5, cantidadProducida: 5, cantidadEntregada: 7 }),
    ]);
    expect(items[0]?.pendiente).toBe(0);
    expect(items[0]?.disponible).toBe(0);
  });

  it('agrupa los renglones legacy sin codigo_item por código de pieza', () => {
    const items = agruparPendientesPorItem([
      partida({ id: 'a', codigoItem: null, codigoPieza: 'COT-001' }),
      partida({ id: 'b', codigoItem: null, codigoPieza: 'COT-001', cantidadEntregada: 10 }),
      partida({ id: 'c', codigoItem: 'IT02', codigoPieza: 'PZA-9' }),
    ]);

    expect(items.map((item) => item.codigoItem)).toEqual(['COT-001', 'IT02']);
    expect(items[0]).toMatchObject({ pendiente: 10, cantidadEntregada: 10 });
    expect(items[1]).toMatchObject({ codigoItem: 'IT02', pendiente: 10 });
  });

  it('ordena por código y suma el pendiente total', () => {
    const items = agruparPendientesPorItem([
      partida({ id: 'c', codigoItem: 'IT10' }),
      partida({ id: 'a', codigoItem: 'IT02', cantidadEntregada: 4 }),
      partida({ id: 'b', codigoItem: 'IT07', cantidadEntregada: 10 }),
    ]);
    expect(items.map((item) => item.codigoItem)).toEqual(['IT02', 'IT07', 'IT10']);
    expect(totalPendiente(items)).toBe(6 + 0 + 10);
  });
});
