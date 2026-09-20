import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import {
  ErrorOrden,
  actualizarOrdenBorradorServicio,
  mensajeErrorOrden,
} from '@/modulos/ordenes/servicios/ordenes-servicio';
import {
  esquemaActualizarOrdenBorrador,
  type ActualizarOrdenBorradorInput,
} from '@/modulos/ordenes/validaciones/ordenes';

const clienteConRpc = (rpc: ReturnType<typeof vi.fn>): SupabaseClient<Database> =>
  ({ rpc } as unknown as SupabaseClient<Database>);

const ORDEN = '11111111-1111-4111-8111-111111111111';
const PARTIDA = '22222222-2222-4222-8222-222222222222';
const TOKEN = '2026-09-19T12:00:00.000Z';

const ENTRADA_VALIDA: ActualizarOrdenBorradorInput = {
  ordenId: ORDEN,
  actualizadoEn: TOKEN,
  prioridad: 'alta',
  fechaCompromiso: '2026-10-15T12:00:00.000Z',
  partidas: [
    {
      id: PARTIDA,
      codigoPieza: 'A-100',
      cantidadSolicitada: 5,
      unidadMedida: 'pza',
      tiempoEstimadoMinutos: 30,
    },
    { codigoPieza: 'C-300', cantidadSolicitada: 2, unidadMedida: 'pza', tiempoEstimadoMinutos: 0 },
  ],
};

describe('esquema de edición de orden en borrador (ORD-05)', () => {
  it('acepta partidas existentes (id) y nuevas (sin id)', () => {
    expect(esquemaActualizarOrdenBorrador.safeParse(ENTRADA_VALIDA).success).toBe(true);
    // El token llega de PostgREST con offset (+00:00), no solo con Z.
    expect(
      esquemaActualizarOrdenBorrador.safeParse({
        ...ENTRADA_VALIDA,
        actualizadoEn: '2026-09-19T12:00:00.123456+00:00',
      }).success,
    ).toBe(true);
  });

  it('rechaza token, uuid, partidas vacías e id inválido', () => {
    expect(
      esquemaActualizarOrdenBorrador.safeParse({ ...ENTRADA_VALIDA, actualizadoEn: 'ayer' }).success,
    ).toBe(false);
    expect(
      esquemaActualizarOrdenBorrador.safeParse({ ...ENTRADA_VALIDA, ordenId: 'orden-1' }).success,
    ).toBe(false);
    expect(
      esquemaActualizarOrdenBorrador.safeParse({ ...ENTRADA_VALIDA, partidas: [] }).success,
    ).toBe(false);
    expect(
      esquemaActualizarOrdenBorrador.safeParse({
        ...ENTRADA_VALIDA,
        partidas: [{ ...ENTRADA_VALIDA.partidas[1], id: 'no-uuid' }],
      }).success,
    ).toBe(false);
  });
});

describe('actualizarOrdenBorradorServicio', () => {
  it('manda el token y las partidas mapeadas a la RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          id: ORDEN,
          folio: 'OP-001010',
          estado: 'borrador',
          prioridad: 'alta',
          fecha_compromiso: '2026-10-15T12:00:00.000Z',
          actualizado_en: '2026-09-19T13:00:00.000Z',
        },
      ],
      error: null,
    });

    const resultado = await actualizarOrdenBorradorServicio(clienteConRpc(rpc), ENTRADA_VALIDA);

    expect(resultado.estado).toBe('borrador');
    expect(resultado.actualizadoEn).toBe('2026-09-19T13:00:00.000Z');
    expect(rpc).toHaveBeenCalledWith('actualizar_orden_borrador', {
      p_orden_id: ORDEN,
      p_actualizado_en: TOKEN,
      p_prioridad: 'alta',
      p_fecha_compromiso: '2026-10-15T12:00:00.000Z',
      p_partidas: [
        expect.objectContaining({
          id: PARTIDA,
          codigo_pieza: 'A-100',
          cantidad_solicitada: 5,
          material_id: null,
        }),
        expect.objectContaining({ id: null, codigo_pieza: 'C-300' }),
      ],
    });
  });

  it('traduce los errores de negocio de la RPC', async () => {
    const rpcDesactualizada = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'orden_desactualizada' },
    });
    await expect(
      actualizarOrdenBorradorServicio(clienteConRpc(rpcDesactualizada), ENTRADA_VALIDA),
    ).rejects.toMatchObject({ codigo: 'orden_desactualizada' });

    const rpcNoEditable = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'orden_no_editable' },
    });
    await expect(
      actualizarOrdenBorradorServicio(clienteConRpc(rpcNoEditable), ENTRADA_VALIDA),
    ).rejects.toMatchObject({ codigo: 'orden_no_editable' });

    const rpcHistorial = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'partida_con_historial' },
    });
    await expect(
      actualizarOrdenBorradorServicio(clienteConRpc(rpcHistorial), ENTRADA_VALIDA),
    ).rejects.toMatchObject({ codigo: 'partida_con_historial' });
  });
});

describe('mensajes de edición', () => {
  it('explica el conflicto de versión, el estado y el historial', () => {
    expect(mensajeErrorOrden(new ErrorOrden('orden_desactualizada'), 'actualizar')).toMatch(
      /otra persona/,
    );
    expect(mensajeErrorOrden(new ErrorOrden('orden_no_editable'), 'actualizar')).toMatch(
      /borrador/,
    );
    expect(mensajeErrorOrden(new ErrorOrden('partida_con_historial'), 'actualizar')).toMatch(
      /historial/,
    );
  });
});
