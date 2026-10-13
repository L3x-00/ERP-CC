// Obs. cliente 2026-10-13: el servicio que arma los faltantes de contenido para
// validar compone los cargadores existentes con la función compartida con la ficha.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/compartido/tipos/supabase';

const { propuestaMock, archivosMock, itemsRfqMock } = vi.hoisted(() => ({
  propuestaMock: vi.fn(),
  archivosMock: vi.fn(),
  itemsRfqMock: vi.fn(),
}));

vi.mock('@/modulos/propuestas/servicios/obtener-propuesta', () => ({
  obtenerPropuestaPorId: (...argumentos: unknown[]) => propuestaMock(...argumentos),
  obtenerArchivosDePropuesta: (...argumentos: unknown[]) => archivosMock(...argumentos),
  obtenerIdsItemsRfq: (...argumentos: unknown[]) => itemsRfqMock(...argumentos),
}));

import {
  mensajeBloqueoValidacion,
  obtenerFaltantesContenidoRevision,
} from '@/modulos/propuestas/servicios/faltantes-validacion';

const REV_ID = 'rev-a';
const PROPUESTA_ID = 'propuesta-1';

function clienteConRevision(existe = true) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: existe ? { propuesta_id: PROPUESTA_ID } : null,
            error: null,
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient<Database>;
}

function detalle(parcial: Record<string, unknown> = {}) {
  return {
    propuesta: { id: PROPUESTA_ID, rfqId: 'rfq-1' },
    revisiones: [
      { id: REV_ID, letra: 'A', requiereRevisionRuteo: false, requiereRevisionCosteo: false },
    ],
    items: [{ id: 'i1', revisionId: REV_ID, codigo: 'IT01', activo: true }],
    ruteo: [{ itemId: 'i1', costeadoEn: '2026-10-13T10:00:00Z' }],
    ...parcial,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  propuestaMock.mockResolvedValue(detalle());
  itemsRfqMock.mockResolvedValue(['rfq-item-1']);
  archivosMock.mockResolvedValue([
    { entidad: 'propuesta_revision', entidadId: REV_ID, vigente: true },
  ]);
});

describe('obtenerFaltantesContenidoRevision', () => {
  it('una propuesta completa no tiene faltantes', async () => {
    await expect(obtenerFaltantesContenidoRevision(clienteConRevision(), REV_ID)).resolves.toEqual(
      [],
    );
    expect(archivosMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ rfqId: 'rfq-1', rfqItemIds: ['rfq-item-1'], itemIds: ['i1'] }),
    );
  });

  it('lista el contenido que falta (archivo, ruteo sin costear)', async () => {
    archivosMock.mockResolvedValue([]);
    propuestaMock.mockResolvedValue(detalle({ ruteo: [{ itemId: 'i1', costeadoEn: null }] }));

    await expect(obtenerFaltantesContenidoRevision(clienteConRevision(), REV_ID)).resolves.toEqual([
      'ítem IT01: costear el ruteo',
      'al menos un archivo',
    ]);
  });

  it('devuelve null si la revisión no existe o la carga falla (bloquear, no dejar pasar)', async () => {
    await expect(
      obtenerFaltantesContenidoRevision(clienteConRevision(false), REV_ID),
    ).resolves.toBeNull();

    propuestaMock.mockRejectedValue(new Error('No se pudo cargar la propuesta'));
    await expect(
      obtenerFaltantesContenidoRevision(clienteConRevision(), REV_ID),
    ).resolves.toBeNull();
  });
});

describe('mensajeBloqueoValidacion', () => {
  it('completa → null; incompleta → mensaje con lo que falta; ilegible → mensaje de reintento', async () => {
    await expect(mensajeBloqueoValidacion(clienteConRevision(), REV_ID)).resolves.toBeNull();

    archivosMock.mockResolvedValue([]);
    await expect(mensajeBloqueoValidacion(clienteConRevision(), REV_ID)).resolves.toBe(
      'La propuesta está incompleta. Falta: al menos un archivo.',
    );

    await expect(mensajeBloqueoValidacion(clienteConRevision(false), REV_ID)).resolves.toMatch(
      /No se pudo comprobar/,
    );
  });
});
