import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import {
  aprobarOportunidadYCrearOrdenServicio,
  cambiarEstadoOrdenServicio,
  crearOrdenManualServicio,
  registrarConsumoMaterialServicio,
} from '@/modulos/ordenes/servicios/ordenes-servicio';

const clienteConRpc = (rpc: ReturnType<typeof vi.fn>): SupabaseClient<Database> =>
  ({ rpc } as unknown as SupabaseClient<Database>);

const ENTRADA_MANUAL = {
  clienteId: '11111111-1111-4111-8111-111111111111',
  fechaCompromiso: '2026-09-15T18:00:00.000Z',
  prioridad: 'normal' as const,
  partidas: [
    {
      codigoPieza: 'EJE-01',
      cantidadSolicitada: 2,
      unidadMedida: 'pieza',
      tiempoEstimadoMinutos: 12,
    },
  ],
};

describe('servicios transaccionales de órdenes', () => {
  it('manda cabecera y partidas a la RPC manual sin calcular folio en TypeScript', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: '22222222-2222-4222-8222-222222222222', folio: 'OP-001004' }],
      error: null,
    });

    const resultado = await crearOrdenManualServicio(clienteConRpc(rpc), ENTRADA_MANUAL);

    expect(resultado).toEqual({ id: '22222222-2222-4222-8222-222222222222', folio: 'OP-001004' });
    expect(rpc).toHaveBeenCalledWith('crear_orden_manual', {
      p_cliente_id: ENTRADA_MANUAL.clienteId,
      p_fecha_compromiso: ENTRADA_MANUAL.fechaCompromiso,
      p_prioridad: 'normal',
      p_partidas: [
        expect.objectContaining({
          codigo_pieza: 'EJE-01',
          cantidad_solicitada: 2,
          material_id: null,
        }),
      ],
    });
  });

  it('conserva el resultado idempotente si una oportunidad ya tenía OP', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          folio: 'OP-001004',
          ya_existia: true,
        },
      ],
      error: null,
    });

    const resultado = await aprobarOportunidadYCrearOrdenServicio(clienteConRpc(rpc), {
      pipelineId: '33333333-3333-4333-8333-333333333333',
      clienteId: ENTRADA_MANUAL.clienteId,
      fechaCompromiso: ENTRADA_MANUAL.fechaCompromiso,
    });

    expect(resultado).toEqual({
      id: '22222222-2222-4222-8222-222222222222',
      folio: 'OP-001004',
      yaExistia: true,
    });
  });

  it('clasifica el conflicto de estado de Postgres sin filtrar su mensaje', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'estado_conflicto' },
    });

    await expect(
      cambiarEstadoOrdenServicio(clienteConRpc(rpc), {
        ordenId: '22222222-2222-4222-8222-222222222222',
        estadoActual: 'programada',
        estado: 'en_proceso',
      }),
    ).rejects.toMatchObject({ codigo: 'estado_conflicto' });
  });

  it('registra consumo y scrap solo mediante la RPC atómica', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          costo_unitario_momento: 25,
          cantidad_total: 3.5,
          movimiento_inventario_id: '55555555-5555-4555-8555-555555555555',
        },
      ],
      error: null,
    });

    const resultado = await registrarConsumoMaterialServicio(clienteConRpc(rpc), {
      partidaId: '22222222-2222-4222-8222-222222222222',
      materialId: '33333333-3333-4333-8333-333333333333',
      cantidadUsada: 3,
      cantidadScrap: 0.5,
    });

    expect(resultado).toEqual({
      id: '44444444-4444-4444-8444-444444444444',
      costoUnitarioMomento: 25,
      cantidadTotal: 3.5,
      movimientoInventarioId: '55555555-5555-4555-8555-555555555555',
    });
    expect(rpc).toHaveBeenCalledWith('registrar_consumo_material_op', {
      p_partida_id: '22222222-2222-4222-8222-222222222222',
      p_material_id: '33333333-3333-4333-8333-333333333333',
      p_cantidad_usada: 3,
      p_cantidad_scrap: 0.5,
    });
  });
});
