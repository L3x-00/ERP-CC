// Obs. cliente 2026-10-13: Validar propuesta prellena el canal con el del RFQ de
// origen. Este servicio lee ese canal sin romper la ficha si algo falla.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/compartido/tipos/supabase';
import {
  obtenerCanalRfq,
  obtenerFechasRfq,
} from '@/modulos/propuestas/servicios/obtener-propuesta';
import { textoReferenciaFechasRfq } from '@/modulos/propuestas/utilidades/referencia-fechas-rfq';

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

// Obs. cliente 2026-10-21: al aceptar, quien confirma la fecha compromiso ve lo
// que pidió el cliente y el plazo ofrecido (solo referencia, nunca el compromiso).
describe('obtenerFechasRfq', () => {
  it('lee la fecha requerida (solo el día) y el plazo comercial del RFQ de origen', async () => {
    maybeSingleMock.mockResolvedValue({
      data: { fecha_requerida: '2026-11-30T00:00:00+00:00', plazo_comercial: ' Fabricación 5-7 días ' },
      error: null,
    });

    await expect(obtenerFechasRfq(cliente, RFQ_ID)).resolves.toEqual({
      fechaRequerida: '2026-11-30',
      plazoComercial: 'Fabricación 5-7 días',
    });
    expect(selectMock).toHaveBeenCalledWith('fecha_requerida, plazo_comercial');
    expect(eqMock).toHaveBeenCalledWith('id', RFQ_ID);
  });

  it.each([
    ['sin ninguno de los dos', { data: { fecha_requerida: null, plazo_comercial: null }, error: null }],
    ['plazo en blanco', { data: { fecha_requerida: null, plazo_comercial: '   ' }, error: null }],
    ['RFQ fuera de RLS', { data: null, error: null }],
    ['error de lectura', { data: null, error: { message: 'boom' } }],
  ])('%s → null', async (_caso, respuesta) => {
    maybeSingleMock.mockResolvedValue(respuesta);

    await expect(obtenerFechasRfq(cliente, RFQ_ID)).resolves.toBeNull();
  });
});

describe('textoReferenciaFechasRfq', () => {
  it('une lo que pidió el cliente y el plazo ofrecido', () => {
    expect(
      textoReferenciaFechasRfq({ fechaRequerida: '2026-11-30', plazoComercial: 'Fabricación 5-7 días' }),
    ).toBe('El cliente pidió recibirlo el 30 de noviembre de 2026 · Plazo ofrecido: Fabricación 5-7 días');
  });

  it('muestra solo el dato que existe y nada si no hay ninguno', () => {
    expect(textoReferenciaFechasRfq({ fechaRequerida: null, plazoComercial: 'Entrega 10 días' })).toBe(
      'Plazo ofrecido: Entrega 10 días',
    );
    expect(textoReferenciaFechasRfq({ fechaRequerida: null, plazoComercial: null })).toBeNull();
    expect(textoReferenciaFechasRfq(null)).toBeNull();
  });
});
