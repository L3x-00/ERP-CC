import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import { cerrarSesionTrabajoServicio } from '@/modulos/produccion/servicios/sesiones-servicio';

const IDS = {
  sesion: '22222222-2222-4222-8222-222222222222',
  operador: '33333333-3333-4333-8333-333333333333',
  material: '44444444-4444-4444-8444-444444444444',
};

const clienteConRpc = (rpc: ReturnType<typeof vi.fn>): SupabaseClient<Database> =>
  ({ rpc } as unknown as SupabaseClient<Database>);

const filaCierre = {
  id: IDS.sesion,
  estado_sesion: 'finalizada',
  horas_brutas: 1.25,
  horas_netas: 1,
  piezas_producidas: 3,
  cantidad_producida_partida: 3,
  estado_orden: 'en_proceso',
  estado_planeacion: 'programada',
  actualizado_en: '2026-10-28T11:15:00.000Z',
};

describe('cerrarSesionTrabajoServicio', () => {
  it('cierra con la RPC transaccional y envía el consumo validado', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [filaCierre], error: null });

    const resultado = await cerrarSesionTrabajoServicio(clienteConRpc(rpc), {
      sesionId: IDS.sesion,
      operadorId: IDS.operador,
      piezasProducidas: 3,
      estadoDestino: 'finalizada',
      pinConfirmacion: '4826',
      notas: 'Cierre de prueba',
      consumo: {
        materialId: IDS.material,
        cantidadUsada: 2,
        cantidadScrap: 0.5,
      },
    });

    expect(rpc).toHaveBeenCalledWith('cerrar_sesion_con_consumo_operador', {
      p_sesion_id: IDS.sesion,
      p_operador_id: IDS.operador,
      p_piezas_producidas: 3,
      p_material_id: IDS.material,
      p_cantidad_usada: 2,
      p_cantidad_scrap: 0.5,
      p_meta_proceso_id: null,
      p_notas: 'Cierre de prueba',
    });
    expect(resultado).toMatchObject({
      id: IDS.sesion,
      estadoSesion: 'finalizada',
      piezasProducidas: 3,
      horasNetas: 1,
    });
  });

  it('mantiene la RPC original cuando la sesión se pausa', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ ...filaCierre, estado_sesion: 'pausada' }],
      error: null,
    });

    await cerrarSesionTrabajoServicio(clienteConRpc(rpc), {
      sesionId: IDS.sesion,
      operadorId: IDS.operador,
      piezasProducidas: 0,
      estadoDestino: 'pausada',
      pinConfirmacion: '4826',
      motivoPausa: 'MATERIAL',
    });

    expect(rpc).toHaveBeenCalledWith('cerrar_sesion_trabajo_operador', {
      p_sesion_id: IDS.sesion,
      p_operador_id: IDS.operador,
      p_piezas_producidas: 0,
      p_estado_destino: 'pausada',
      p_motivo_pausa: 'MATERIAL',
    });
  });

  it('no permite terminar sin consumo antes de invocar PostgreSQL', async () => {
    const rpc = vi.fn();

    await expect(cerrarSesionTrabajoServicio(clienteConRpc(rpc), {
      sesionId: IDS.sesion,
      operadorId: IDS.operador,
      piezasProducidas: 0,
      estadoDestino: 'finalizada',
      pinConfirmacion: '4826',
    })).rejects.toMatchObject({
      codigo: 'cierre_sesion_invalido',
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
