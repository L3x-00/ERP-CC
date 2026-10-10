import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/compartido/tipos/supabase';
import { ajustarOrdenPostAceptacionServicio } from '@/modulos/ordenes/servicios/orden-sii-servicio';

const ORDEN_ID = '00000000-0000-4000-8000-0000000b5001';
const ACTOR_ID = '00000000-0000-4000-8000-0000000b5002';
const CORRELATION_ID = '00000000-0000-4000-8000-0000000b5003';
const ACTUALIZADO_EN = '2026-10-06T12:00:00.000Z';

describe('ajuste operativo C4.2', () => {
  it('envía solo las claves proporcionadas y usa fecha_operativa', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: ORDEN_ID, estado_sii: 'PLANIFICADA', actualizado_en: ACTUALIZADO_EN }],
      error: null,
    });
    const cliente = { rpc } as unknown as SupabaseClient<Database>;

    await ajustarOrdenPostAceptacionServicio(cliente, {
      ordenId: ORDEN_ID,
      actualizadoEn: ACTUALIZADO_EN,
      motivo: 'Reprogramación acordada',
      cambios: { fechaOperativa: '2026-10-08T12:00:00.000Z' },
      actorId: ACTOR_ID,
      correlationId: CORRELATION_ID,
    });

    expect(rpc).toHaveBeenCalledWith('ajustar_orden_post_aceptacion', {
      p_orden_id: ORDEN_ID,
      p_cambios: { fecha_operativa: '2026-10-08T12:00:00.000Z' },
      p_motivo: 'Reprogramación acordada',
      p_actualizado_en: ACTUALIZADO_EN,
      p_actor_id: ACTOR_ID,
      p_correlation_id: CORRELATION_ID,
    });
  });
});
