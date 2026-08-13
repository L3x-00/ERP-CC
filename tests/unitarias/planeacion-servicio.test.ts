import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import {
  ErrorPlaneacion,
  activarModoPreparacionServicio,
  mensajeErrorPlaneacion,
  programarPartidaRecursoServicio,
  reprogramarPartidaRecursoServicio,
} from '@/modulos/planeacion/servicios/planeacion-servicio';

const clienteConRpc = (rpc: ReturnType<typeof vi.fn>): SupabaseClient<Database> =>
  ({ rpc } as unknown as SupabaseClient<Database>);

const PROGRAMACION_ID = '11111111-1111-4111-8111-111111111111';
const ORDEN_ID = '22222222-2222-4222-8222-222222222222';
const PARTIDA_ID = '33333333-3333-4333-8333-333333333333';
const RECURSO_ID = '44444444-4444-4444-8444-444444444444';
const ACTUALIZADO_EN = '2026-09-15T12:00:00.000Z';

describe('servicios transaccionales de Planeación', () => {
  it('delega la programación a la RPC atómica y mapea la respuesta', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          id: PROGRAMACION_ID,
          estado_planeacion: 'programada',
          actualizado_en: ACTUALIZADO_EN,
        },
      ],
      error: null,
    });

    const resultado = await programarPartidaRecursoServicio(clienteConRpc(rpc), {
      ordenId: ORDEN_ID,
      partidaId: PARTIDA_ID,
      recursoId: RECURSO_ID,
      secuencia: 1,
      fechaProgramada: '2026-09-15',
      turno: 'matutino',
      horasEstimadas: 4.5,
      ordenPrioridad: 2,
    });

    expect(resultado).toEqual({
      id: PROGRAMACION_ID,
      estadoPlaneacion: 'programada',
      actualizadoEn: ACTUALIZADO_EN,
    });
    expect(rpc).toHaveBeenCalledWith('programar_partida_recurso', {
      p_orden_id: ORDEN_ID,
      p_partida_id: PARTIDA_ID,
      p_recurso_id: RECURSO_ID,
      p_secuencia: 1,
      p_fecha_programada: '2026-09-15',
      p_turno: 'matutino',
      p_horas_estimadas: 4.5,
      p_orden_prioridad: 2,
    });
  });

  it('incluye la marca compare-and-set al reprogramar', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          id: PROGRAMACION_ID,
          estado_planeacion: 'programada',
          actualizado_en: '2026-09-15T12:05:00.000Z',
        },
      ],
      error: null,
    });

    await reprogramarPartidaRecursoServicio(clienteConRpc(rpc), {
      programacionId: PROGRAMACION_ID,
      recursoId: RECURSO_ID,
      fechaProgramada: '2026-09-16',
      turno: 'vespertino',
      horasEstimadas: 3,
      ordenPrioridad: 3,
      actualizadoEnEsperado: ACTUALIZADO_EN,
    });

    expect(rpc).toHaveBeenCalledWith('reprogramar_partida_recurso', {
      p_programacion_id: PROGRAMACION_ID,
      p_recurso_id: RECURSO_ID,
      p_fecha_programada: '2026-09-16',
      p_turno: 'vespertino',
      p_horas_estimadas: 3,
      p_orden_prioridad: 3,
      p_actualizado_en_esperado: ACTUALIZADO_EN,
    });
  });

  it('activa preparación solo con la marca concurrente esperada', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          id: PROGRAMACION_ID,
          estado_planeacion: 'en_preparacion',
          actualizado_en: '2026-09-15T12:10:00.000Z',
        },
      ],
      error: null,
    });

    const resultado = await activarModoPreparacionServicio(clienteConRpc(rpc), {
      programacionId: PROGRAMACION_ID,
      actualizadoEnEsperado: ACTUALIZADO_EN,
    });

    expect(resultado.estadoPlaneacion).toBe('en_preparacion');
    expect(rpc).toHaveBeenCalledWith('activar_modo_preparacion', {
      p_programacion_id: PROGRAMACION_ID,
      p_actualizado_en_esperado: ACTUALIZADO_EN,
    });
  });

  it('convierte un conflicto de base en un error de dominio sin filtrar detalles', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'programacion_conflicto' },
    });

    await expect(
      reprogramarPartidaRecursoServicio(clienteConRpc(rpc), {
        programacionId: PROGRAMACION_ID,
        recursoId: RECURSO_ID,
        fechaProgramada: '2026-09-16',
        turno: 'vespertino',
        horasEstimadas: 3,
        ordenPrioridad: 3,
        actualizadoEnEsperado: ACTUALIZADO_EN,
      }),
    ).rejects.toMatchObject({ codigo: 'programacion_conflicto' });
  });

  it('expone mensajes genéricos estables para Server Actions', () => {
    expect(
      mensajeErrorPlaneacion(new ErrorPlaneacion('capacidad_insuficiente'), 'programar'),
    ).toBe('El recurso no tiene capacidad disponible en el turno seleccionado');
    expect(
      mensajeErrorPlaneacion(new ErrorPlaneacion('programacion_conflicto'), 'reprogramar'),
    ).toBe('La programación fue modificada por otro usuario. Recarga e inténtalo de nuevo');
    expect(mensajeErrorPlaneacion(new Error('detalle interno'), 'preparar')).toBe(
      'No se pudo actualizar la programación',
    );
  });
});
