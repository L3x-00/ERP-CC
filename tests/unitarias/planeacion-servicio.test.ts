import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import {
  ErrorPlaneacion,
  activarModoPreparacionServicio,
  codigoErrorPlaneacion,
  mensajeErrorPlaneacion,
  obtenerCompromisosCalendarioServicio,
  programarPartidaRecursoServicio,
  reprogramarPartidaRecursoServicio,
} from '@/modulos/planeacion/servicios/planeacion-servicio';

type ConsultaFalsa = PromiseLike<{ data: unknown[]; error: null }> & {
  select: (...args: unknown[]) => ConsultaFalsa;
  eq: (...args: unknown[]) => ConsultaFalsa;
  neq: (...args: unknown[]) => ConsultaFalsa;
  gte: (...args: unknown[]) => ConsultaFalsa;
  lte: (...args: unknown[]) => ConsultaFalsa;
  in: (...args: unknown[]) => ConsultaFalsa;
  order: (...args: unknown[]) => ConsultaFalsa;
  limit: (...args: unknown[]) => ConsultaFalsa;
  maybeSingle: () => ConsultaFalsa;
};

function clienteConTablas(tablas: Readonly<Record<string, unknown[]>>): SupabaseClient<Database> {
  function consulta(tabla: string): ConsultaFalsa {
    const respuesta = Promise.resolve({ data: tablas[tabla] ?? [], error: null as null });
    const encadenable: ConsultaFalsa = {
      select: () => encadenable,
      eq: () => encadenable,
      neq: () => encadenable,
      gte: () => encadenable,
      lte: () => encadenable,
      in: () => encadenable,
      order: () => encadenable,
      limit: () => encadenable,
      maybeSingle: () => encadenable,
      then: respuesta.then.bind(respuesta),
    };
    return encadenable;
  }
  return { from: (tabla: string) => consulta(tabla) } as unknown as SupabaseClient<Database>;
}

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
      actorId: '55555555-5555-4555-8555-555555555555',
      correlationId: '66666666-6666-4666-8666-666666666666',
    });

    expect(resultado).toEqual({
      id: PROGRAMACION_ID,
      estadoPlaneacion: 'programada',
      actualizadoEn: ACTUALIZADO_EN,
    });
    expect(rpc).toHaveBeenCalledWith('programar_partida_recurso_auditada', {
      p_orden_id: ORDEN_ID,
      p_partida_id: PARTIDA_ID,
      p_recurso_id: RECURSO_ID,
      p_secuencia: 1,
      p_meta_proceso_id: null,
      p_fecha_programada: '2026-09-15',
      p_turno: 'matutino',
      p_horas_estimadas: 4.5,
      p_orden_prioridad: 2,
      p_actor_id: '55555555-5555-4555-8555-555555555555',
      p_correlation_id: '66666666-6666-4666-8666-666666666666',
    });
  });

  it('programa por operación con secuencia nula (la deriva PostgreSQL de la meta)', async () => {
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
    const META_ID = '77777777-7777-4777-8777-777777777777';

    await programarPartidaRecursoServicio(clienteConRpc(rpc), {
      ordenId: ORDEN_ID,
      partidaId: PARTIDA_ID,
      recursoId: RECURSO_ID,
      secuencia: null,
      metaProcesoId: META_ID,
      fechaProgramada: '2026-09-15',
      turno: 'matutino',
      horasEstimadas: 4.5,
      ordenPrioridad: 2,
      actorId: '55555555-5555-4555-8555-555555555555',
      correlationId: '66666666-6666-4666-8666-666666666666',
    });

    expect(rpc).toHaveBeenCalledWith('programar_partida_recurso_auditada', {
      p_orden_id: ORDEN_ID,
      p_partida_id: PARTIDA_ID,
      p_recurso_id: RECURSO_ID,
      p_secuencia: null,
      p_meta_proceso_id: META_ID,
      p_fecha_programada: '2026-09-15',
      p_turno: 'matutino',
      p_horas_estimadas: 4.5,
      p_orden_prioridad: 2,
      p_actor_id: '55555555-5555-4555-8555-555555555555',
      p_correlation_id: '66666666-6666-4666-8666-666666666666',
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
      motivo: 'Cambio de capacidad',
      actualizadoEnEsperado: ACTUALIZADO_EN,
      actorId: '55555555-5555-4555-8555-555555555555',
      correlationId: '66666666-6666-4666-8666-666666666666',
    });

    expect(rpc).toHaveBeenCalledWith('reprogramar_partida_recurso_auditada', {
      p_programacion_id: PROGRAMACION_ID,
      p_recurso_id: RECURSO_ID,
      p_fecha_programada: '2026-09-16',
      p_turno: 'vespertino',
      p_horas_estimadas: 3,
      p_orden_prioridad: 3,
      p_actualizado_en_esperado: ACTUALIZADO_EN,
      p_motivo: 'Cambio de capacidad',
      p_actor_id: '55555555-5555-4555-8555-555555555555',
      p_correlation_id: '66666666-6666-4666-8666-666666666666',
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
        motivo: 'Cambio de capacidad',
        actualizadoEnEsperado: ACTUALIZADO_EN,
        actorId: '55555555-5555-4555-8555-555555555555',
        correlationId: '66666666-6666-4666-8666-666666666666',
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

  it('conserva el código estable para que la UI ofrezca el flujo de solución', () => {
    expect(codigoErrorPlaneacion(new ErrorPlaneacion('recurso_incompatible'))).toBe(
      'recurso_incompatible',
    );
    expect(codigoErrorPlaneacion(new ErrorPlaneacion('programacion_duplicada'))).toBe(
      'programacion_duplicada',
    );
    expect(codigoErrorPlaneacion(new Error('detalle interno'))).toBe('desconocido');
  });

  it('proyecta las propuestas aceptadas sin programación en su fecha compromiso', async () => {
    const cliente = clienteConTablas({
      ordenes_produccion: [{
        id: ORDEN_ID,
        folio: 'OP-000042',
        fecha_compromiso_comercial: '2026-11-28',
      }],
      partidas_orden_produccion: [{
        id: PARTIDA_ID,
        orden_id: ORDEN_ID,
        codigo_pieza: 'PZA-1',
        area_trabajo_codigo: 'LASER_01',
        procesos: ['Corte láser'],
        tiempo_estimado_minutos: 90,
      }],
      programacion_areas: [],
    });

    const compromisos = await obtenerCompromisosCalendarioServicio(cliente, {
      fechaInicio: '2026-11-23',
      fechaFin: '2026-11-29',
    });

    expect(compromisos).toEqual([{
      partidaId: PARTIDA_ID,
      ordenId: ORDEN_ID,
      folio: 'OP-000042',
      codigoPieza: 'PZA-1',
      fechaCompromiso: '2026-11-28',
      areaCodigo: 'LASER_01',
      procesos: ['Corte láser'],
      horas: 1.5,
      estimadoMinutos: 90,
    }]);
  });

  it('no duplica en el calendario una propuesta que ya tiene programación', async () => {
    const cliente = clienteConTablas({
      ordenes_produccion: [{
        id: ORDEN_ID,
        folio: 'OP-000042',
        fecha_compromiso_comercial: '2026-11-28',
      }],
      partidas_orden_produccion: [{
        id: PARTIDA_ID,
        orden_id: ORDEN_ID,
        codigo_pieza: 'PZA-1',
        area_trabajo_codigo: 'LASER_01',
        procesos: ['Corte láser'],
        tiempo_estimado_minutos: 90,
      }],
      programacion_areas: [{ partida_id: PARTIDA_ID, estado_planeacion: 'programada' }],
    });

    const compromisos = await obtenerCompromisosCalendarioServicio(cliente, {
      fechaInicio: '2026-11-23',
      fechaFin: '2026-11-29',
    });

    expect(compromisos).toEqual([]);
  });
});
