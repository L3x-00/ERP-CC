// Obs. cliente 2026-10-13: Validar propuesta prellena el canal con el del RFQ de
// origen. Este servicio lee ese canal sin romper la ficha si algo falla.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/compartido/tipos/supabase';
import { obtenerCanalRfq } from '@/modulos/propuestas/servicios/obtener-propuesta';

const RFQ_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const { maybeSingleMock, eqMock, selectMock, fromMock } = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { maybeSingleMock: maybeSingle, eqMock: eq, selectMock: select, fromMock: from };
});

const cliente = { from: fromMock } as unknown as SupabaseClient<Database>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('obtenerCanalRfq', () => {
  it('lee canal y detalle del RFQ de origen', async () => {
    maybeSingleMock.mockResolvedValue({
      data: { canal: 'OTRO', canal_detalle: ' Feria industrial ' },
      error: null,
    });

    await expect(obtenerCanalRfq(cliente, RFQ_ID)).resolves.toEqual({
      canal: 'OTRO',
      canalDetalle: 'Feria industrial',
    });
    expect(fromMock).toHaveBeenCalledWith('pipeline');
    expect(selectMock).toHaveBeenCalledWith('canal, canal_detalle');
    expect(eqMock).toHaveBeenCalledWith('id', RFQ_ID);
  });

  it('un canal sin detalle devuelve el detalle en null', async () => {
    maybeSingleMock.mockResolvedValue({ data: { canal: 'CORREO', canal_detalle: null }, error: null });

    await expect(obtenerCanalRfq(cliente, RFQ_ID)).resolves.toEqual({
      canal: 'CORREO',
      canalDetalle: null,
    });
  });

  it.each([
    ['sin canal capturado', { data: { canal: null, canal_detalle: null }, error: null }],
    ['canal en blanco', { data: { canal: '   ', canal_detalle: null }, error: null }],
    ['RFQ inexistente o fuera de RLS', { data: null, error: null }],
  ])('%s → null', async (_caso, respuesta) => {
    maybeSingleMock.mockResolvedValue(respuesta);

    await expect(obtenerCanalRfq(cliente, RFQ_ID)).resolves.toBeNull();
  });

  it('un error de lectura no rompe la ficha: devuelve null y lo registra', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: { message: 'boom' } });

    await expect(obtenerCanalRfq(cliente, RFQ_ID)).resolves.toBeNull();
    expect(console.error).toHaveBeenCalled();
  });
});
