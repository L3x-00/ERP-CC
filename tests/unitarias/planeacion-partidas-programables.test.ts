// C9.2/P06: selector de programación — orden, rotulado, tope y secuencia sugerida.
import { describe, expect, it } from 'vitest';
import {
  prepararPartidasProgramables,
  TOPE_PARTIDAS_PROGRAMABLES,
  type CandidataPartidaProgramable,
} from '@/modulos/planeacion/utilidades/partidas-programables';

function candidata(
  overrides: Partial<CandidataPartidaProgramable> & { partidaId: string },
): CandidataPartidaProgramable {
  return {
    ordenId: 'orden-1',
    etiqueta: `OP · ${overrides.partidaId}`,
    creadoEn: '2026-10-01T10:00:00.000Z',
    secuenciasVigentes: [],
    ...overrides,
  };
}

describe('prepararPartidasProgramables (C9.2/P06)', () => {
  it('pone primero las partidas sin programar, de la más reciente a la más antigua', () => {
    const { partidas } = prepararPartidasProgramables([
      candidata({
        partidaId: 'con-plan',
        secuenciasVigentes: [1],
        creadoEn: '2026-10-10T10:00:00.000Z',
      }),
      candidata({ partidaId: 'antigua', creadoEn: '2026-09-01T10:00:00.000Z' }),
      candidata({ partidaId: 'reciente', creadoEn: '2026-10-05T10:00:00.000Z' }),
    ]);

    expect(partidas.map((partida) => partida.partidaId)).toEqual([
      'reciente',
      'antigua',
      'con-plan',
    ]);
  });

  it('conserva las partidas con una programación vigente y las rotula con su conteo', () => {
    const { partidas } = prepararPartidasProgramables([
      candidata({ partidaId: 'con-plan', secuenciasVigentes: [1, 3] }),
    ]);

    expect(partidas).toHaveLength(1);
    expect(partidas[0]?.etiqueta).toBe('OP · con-plan (2 programada(s))');
    expect(partidas[0]?.programadas).toBe(2);
  });

  it('sugiere la máxima secuencia vigente + 1, o 1 sin programaciones', () => {
    const { partidas } = prepararPartidasProgramables([
      candidata({ partidaId: 'manual', secuenciasVigentes: [2, 7, 4] }),
      candidata({ partidaId: 'nueva' }),
    ]);

    const secuenciaPorPartida = new Map(
      partidas.map((partida) => [partida.partidaId, partida.secuenciaSugerida]),
    );
    expect(secuenciaPorPartida.get('manual')).toBe(8);
    expect(secuenciaPorPartida.get('nueva')).toBe(1);
  });

  it('recorta al tope e informa el total de candidatas', () => {
    const candidatas = Array.from({ length: 305 }, (_, indice) =>
      candidata({
        partidaId: `p-${indice}`,
        creadoEn: `2026-10-01T10:00:${String(indice % 60).padStart(2, '0')}.000Z`,
      }),
    );

    const { partidas, total } = prepararPartidasProgramables(candidatas, 300);

    expect(partidas).toHaveLength(300);
    expect(total).toBe(305);
    expect(TOPE_PARTIDAS_PROGRAMABLES).toBe(300);
  });
});
