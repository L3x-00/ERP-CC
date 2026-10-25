import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/compartido/tipos/supabase';
import { obtenerFichaOrdenServicio } from '@/modulos/ordenes/servicios/ficha-orden-servicio';
import { calcularHorasResumen } from '@/modulos/ordenes/utilidades/resumen-orden';
import type {
  ResumenOrden,
  SesionResumenOrden,
} from '@/modulos/ordenes/tipos/resumen-orden';

type Admin = SupabaseClient<Database>;

/**
 * C10.5: resumen de una sola orden para el modal de la cola. Reutiliza la ficha
 * (origen congelado, partidas, archivos, entregas) y añade las sesiones reales
 * con sus horas, operador y proceso, sin cargar la ficha completa en la lista.
 */
export async function obtenerResumenOrdenServicio(
  admin: Admin,
  ordenId: string,
  opciones: { incluirTotales: boolean },
): Promise<Omit<ResumenOrden, 'permisos'> | null> {
  const ficha = await obtenerFichaOrdenServicio(admin, ordenId, {
    incluirTotales: opciones.incluirTotales,
  });
  if (!ficha) return null;

  const { data: filasSesiones, error: errorSesiones } = await admin
    .from('sesiones_trabajo')
    .select(
      'id, operador_id, programacion_id, partida_id, fecha_inicio, fecha_fin, estado_sesion, piezas_producidas, horas_netas, motivo_pausa_codigo, motivo_pausa, notas',
    )
    .eq('orden_id', ordenId)
    .order('fecha_inicio', { ascending: false });
  if (errorSesiones) throw new Error(`No se pudieron leer las sesiones: ${errorSesiones.message}`);

  const sesionesFilas = filasSesiones ?? [];
  const programacionIds = [...new Set(sesionesFilas.map((sesion) => sesion.programacion_id))];
  const operadorIds = [...new Set(sesionesFilas.map((sesion) => sesion.operador_id))];

  const [programacionesResp, operadoresResp] = await Promise.all([
    programacionIds.length > 0
      ? admin
        .from('programacion_areas')
        .select('id, meta_proceso_id')
        .in('id', programacionIds)
      : Promise.resolve({ data: [], error: null }),
    operadorIds.length > 0
      ? admin
        .from('usuarios')
        .select('id, nombre_completo')
        .in('id', operadorIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (programacionesResp.error) {
    throw new Error(`No se pudo leer la programación de las sesiones: ${programacionesResp.error.message}`);
  }
  if (operadoresResp.error) {
    throw new Error(`No se pudo leer a los operadores: ${operadoresResp.error.message}`);
  }

  const metaPorProgramacion = new Map(
    (programacionesResp.data ?? []).map((fila) => [fila.id, fila.meta_proceso_id] as const),
  );
  const metaIds = [...new Set(
    [...metaPorProgramacion.values()].filter((id): id is string => id !== null),
  )];
  const metasResp = metaIds.length > 0
    ? await admin.from('metas_proceso_partida').select('id, nombre, secuencia').in('id', metaIds)
    : { data: [], error: null };
  if (metasResp.error) {
    throw new Error(`No se pudieron leer los procesos de las sesiones: ${metasResp.error.message}`);
  }

  const nombrePorMeta = new Map((metasResp.data ?? []).map((meta) => [meta.id, meta.nombre]));
  const nombrePorOperador = new Map(
    (operadoresResp.data ?? []).map((operador) => [operador.id, operador.nombre_completo]),
  );
  const codigoPorPartida = new Map(
    ficha.partidas.map((partida) => [partida.id, partida.codigoPieza]),
  );

  const sesiones: SesionResumenOrden[] = sesionesFilas.map((sesion) => {
    const metaId = metaPorProgramacion.get(sesion.programacion_id) ?? null;
    return {
      id: sesion.id,
      operadorNombre: nombrePorOperador.get(sesion.operador_id) ?? 'Operador histórico',
      fechaInicio: sesion.fecha_inicio,
      fechaFin: sesion.fecha_fin,
      estadoSesion: sesion.estado_sesion === 'activa'
        ? 'activa'
        : sesion.estado_sesion === 'pausada'
          ? 'pausada'
          : 'finalizada',
      horasNetas: Number(sesion.horas_netas),
      piezasProducidas: Number(sesion.piezas_producidas),
      partidaCodigo: codigoPorPartida.get(sesion.partida_id) ?? 'Partida',
      proceso: metaId ? nombrePorMeta.get(metaId) ?? 'Proceso' : 'Proceso completo',
      motivoPausa: sesion.motivo_pausa_codigo ?? sesion.motivo_pausa,
      notas: sesion.notas,
    };
  });

  const horasResumen = calcularHorasResumen(ficha.partidas);
  const ultimaEntrega = ficha.entregas[0] ?? null;

  return {
    orden: {
      id: ficha.orden.id,
      folio: ficha.orden.folio,
      folioSii: ficha.orden.folioSii,
      estadoSii: ficha.orden.estadoSii,
      estadoLegacy: ficha.orden.estadoLegacy,
      prioridad: ficha.orden.prioridad,
      clienteNombre: ficha.orden.clienteNombre,
      esInterna: ficha.orden.esInterna,
      fechaRequerida: ficha.orden.fechaCompromisoComercial ?? ficha.orden.fechaOperativa ?? null,
      fechaAprobacion: ficha.orden.creadoEn,
      notas: ficha.orden.notas,
      archivadaEn: ficha.orden.archivadaEn,
    },
    origen: ficha.origen,
    partidas: ficha.partidas.map((partida) => ({
      id: partida.id,
      codigoPieza: partida.codigoPieza,
      descripcion: partida.descripcion,
      cantidadSolicitada: partida.cantidadSolicitada,
      cantidadProducida: partida.cantidadProducida,
      unidadMedida: partida.unidadMedida,
      areaTrabajoCodigo: partida.areaTrabajoCodigo,
      procesos: partida.procesos,
    })),
    horas: {
      estimadas: horasResumen.estimadas,
      reales: horasResumen.reales,
      eficiencia: horasResumen.eficiencia,
      sesiones: sesiones.length,
    },
    archivos: ficha.archivos,
    sesiones,
    entrega: ultimaEntrega
      ? {
        id: ultimaEntrega.id,
        folio: ultimaEntrega.folioSii ?? ultimaEntrega.folio,
        esParcial: ultimaEntrega.esParcial,
        creadoEn: ultimaEntrega.creadoEn,
      }
      : null,
    totales: ficha.totales,
  };
}
