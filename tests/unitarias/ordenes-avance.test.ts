import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import { registrarAvancePartidaServicio } from '@/modulos/ordenes/servicios/ordenes-servicio';
import { esquemaRegistrarAvancePartida } from '@/modulos/ordenes/validaciones/ordenes';

const clienteConRpc = (rpc: ReturnType<typeof vi.fn>): SupabaseClient<Database> =>
  ({ rpc } as unknown as SupabaseClient<Database>);

const ENTRADA_AVANCE = {
  partidaId: '22222222-2222-4222-8222-222222222222',
  operadorId: '33333333-3333-4333-8333-333333333333',
  cantidadProducida: 3,
  cantidadScrap: 0.5,
};

describe('avance atómico de partidas', () => {
  it('acepta producción o scrap positivo y rechaza un avance vacío o negativo', () => {
    expect(
      esquemaRegistrarAvancePartida.safeParse({
        partidaId: ENTRADA_AVANCE.partidaId,
        cantidadProducida: ENTRADA_AVANCE.cantidadProducida,
        cantidadScrap: ENTRADA_AVANCE.cantidadScrap,
      }).success,
    ).toBe(true);
    expect(esquemaRegistrarAvancePartida.safeParse(ENTRADA_AVANCE).success).toBe(false);
    expect(
      esquemaRegistrarAvancePartida.safeParse({
        partidaId: ENTRADA_AVANCE.partidaId,
        cantidadProducida: 0,
        cantidadScrap: 0,
      }).success,
    ).toBe(false);
    expect(
      esquemaRegistrarAvancePartida.safeParse({
        partidaId: ENTRADA_AVANCE.partidaId,
        cantidadProducida: -1,
        cantidadScrap: 0,
      }).success,
    ).toBe(false);
  });

  it('delegá la suma acumulada a la RPC de PostgreSQL con el operador validado', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          partida_id: ENTRADA_AVANCE.partidaId,
          cantidad_producida: 8,
          cantidad_scrap: 1.5,
          actualizado_en: '2026-08-12T11:00:00.000Z',
        },
      ],
      error: null,
    });

    const resultado = await registrarAvancePartidaServicio(clienteConRpc(rpc), ENTRADA_AVANCE);

    expect(rpc).toHaveBeenCalledWith('registrar_avance_partida_op', {
      p_partida_id: ENTRADA_AVANCE.partidaId,
      p_operador_id: ENTRADA_AVANCE.operadorId,
      p_cantidad_producida: 3,
      p_cantidad_scrap: 0.5,
    });
    expect(resultado).toEqual({
      partidaId: ENTRADA_AVANCE.partidaId,
      cantidadProducida: 8,
      cantidadScrap: 1.5,
      actualizadoEn: '2026-08-12T11:00:00.000Z',
    });
  });
});
