// Obs. cliente 2026-10-13: Validar exige ítem, ruteo costeado por proceso y
// archivo. La misma función alimenta la ficha (borde rojo) y las Server Actions.
import { describe, expect, it } from 'vitest';

import {
  calcularFaltantesValidacion,
  contarArchivosRevision,
  type EntradaFaltantesValidacion,
} from '@/modulos/propuestas/utilidades/validacion-propuesta';

const REV_A = { id: 'rev-a', letra: 'A', requiereRevisionRuteo: false, requiereRevisionCosteo: false };
const REV_B = { id: 'rev-b', letra: 'B', requiereRevisionRuteo: false, requiereRevisionCosteo: false };

function entrada(parcial: Partial<EntradaFaltantesValidacion> = {}): EntradaFaltantesValidacion {
  return {
    revision: REV_A,
    revisiones: [REV_A],
    items: [{ id: 'i1', revisionId: 'rev-a', codigo: 'IT01', activo: true }],
    ruteo: [{ itemId: 'i1', costeadoEn: '2026-10-13T10:00:00Z' }],
    archivos: [{ entidad: 'propuesta_revision', entidadId: 'rev-a', vigente: true }],
    ...parcial,
  };
}

describe('calcularFaltantesValidacion', () => {
  it('con ítem, ruteo costeado y archivo no falta nada', () => {
    const faltantes = calcularFaltantesValidacion(entrada());

    expect(faltantes.mensajes).toEqual([]);
    expect(faltantes.sinItemsActivos).toBe(false);
    expect(faltantes.sinArchivos).toBe(false);
  });

  it('sin ítems activos lo marca (un ítem inactivo no cuenta)', () => {
    const faltantes = calcularFaltantesValidacion(
      entrada({ items: [{ id: 'i1', revisionId: 'rev-a', codigo: 'IT01', activo: false }] }),
    );

    expect(faltantes.sinItemsActivos).toBe(true);
    expect(faltantes.contenido).toContain('al menos un ítem activo');
  });

  it('cada ítem activo necesita ruteo por proceso', () => {
    const faltantes = calcularFaltantesValidacion(
      entrada({
        items: [
          { id: 'i1', revisionId: 'rev-a', codigo: 'IT01', activo: true },
          { id: 'i2', revisionId: 'rev-a', codigo: 'IT02', activo: true },
        ],
        ruteo: [{ itemId: 'i1', costeadoEn: '2026-10-13T10:00:00Z' }],
      }),
    );

    expect(faltantes.itemsSinRuteo).toEqual(['IT02']);
    expect(faltantes.contenido).toContain('ítem IT02: ruteo por proceso');
  });

  it('un ruteo con alguna fila sin costear se señala por ítem', () => {
    const faltantes = calcularFaltantesValidacion(
      entrada({
        ruteo: [
          { itemId: 'i1', costeadoEn: '2026-10-13T10:00:00Z' },
          { itemId: 'i1', costeadoEn: null },
        ],
      }),
    );

    expect(faltantes.itemsSinCostear).toEqual(['IT01']);
    expect(faltantes.itemsSinRuteo).toEqual([]);
    expect(faltantes.contenido).toContain('ítem IT01: costear el ruteo');
  });

  it('un ítem inactivo no exige ruteo', () => {
    const faltantes = calcularFaltantesValidacion(
      entrada({
        items: [
          { id: 'i1', revisionId: 'rev-a', codigo: 'IT01', activo: true },
          { id: 'i2', revisionId: 'rev-a', codigo: 'IT02', activo: false },
        ],
      }),
    );

    expect(faltantes.itemsSinRuteo).toEqual([]);
  });

  it('sin archivos lo marca; con solo uno retirado/no vigente tampoco cuenta', () => {
    expect(calcularFaltantesValidacion(entrada({ archivos: [] })).sinArchivos).toBe(true);

    const soloHistorico = calcularFaltantesValidacion(
      entrada({ archivos: [{ entidad: 'propuesta_revision', entidadId: 'rev-a', vigente: false }] }),
    );
    expect(soloHistorico.sinArchivos).toBe(true);
    expect(soloHistorico.contenido).toContain('al menos un archivo');
  });

  it('las confirmaciones «Requiere revisión» van aparte y después del contenido', () => {
    const faltantes = calcularFaltantesValidacion(
      entrada({
        archivos: [],
        revision: { ...REV_A, requiereRevisionRuteo: true, requiereRevisionCosteo: true },
      }),
    );

    expect(faltantes.confirmaciones).toEqual([
      'guardar el ruteo para confirmarlo',
      'guardar los costos para confirmarlos',
    ]);
    expect(faltantes.mensajes).toEqual([
      'al menos un archivo',
      'guardar el ruteo para confirmarlo',
      'guardar los costos para confirmarlos',
    ]);
  });
});

describe('contarArchivosRevision', () => {
  const base = entrada({
    revision: REV_B,
    revisiones: [REV_A, REV_B],
    items: [
      { id: 'i1', revisionId: 'rev-a', codigo: 'IT01', activo: true },
      { id: 'i1b', revisionId: 'rev-b', codigo: 'IT01', activo: true },
    ],
  });

  it('cuenta archivos de revisiones anteriores, del ítem por código estable y heredados', () => {
    const total = contarArchivosRevision({
      ...base,
      archivos: [
        { entidad: 'propuesta_revision', entidadId: 'rev-a', vigente: true },
        { entidad: 'propuesta_item', entidadId: 'i1', vigente: true },
        { entidad: 'rfq', entidadId: 'rfq-1', vigente: true },
        { entidad: 'rfq_item', entidadId: 'rfq-item-1', vigente: true },
      ],
    });

    expect(total).toBe(4);
  });

  it('ignora archivos de revisiones posteriores, de otras entidades y no vigentes', () => {
    const total = contarArchivosRevision({
      ...entrada(),
      revisiones: [REV_A, REV_B],
      archivos: [
        { entidad: 'propuesta_revision', entidadId: 'rev-b', vigente: true },
        { entidad: 'propuesta_item', entidadId: 'otro-item', vigente: true },
        { entidad: 'pdf', entidadId: 'rev-a', vigente: true },
        { entidad: 'rfq', entidadId: 'rfq-1', vigente: false },
      ],
    });

    expect(total).toBe(0);
  });
});
