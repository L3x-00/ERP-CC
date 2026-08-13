import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import {
  ESTADOS_PLANEACION,
  filaACargaCapacidadDiaria,
  filaAProgramacionArea,
  filaARecursoPlaneacion,
  type CargaCapacidadDiaria,
  type EstadoPlaneacion,
  type ProgramacionArea,
  type RecursoPlaneacion,
  type TurnoPlaneacion,
} from '@/modulos/planeacion/tipos/indice';
import type {
  CambiarModoPreparacionInput,
  ProgramarOrdenInput,
} from '@/modulos/planeacion/validaciones/planeacion';

export type CodigoErrorPlaneacion =
  | 'programacion_invalida'
  | 'reprogramacion_invalida'
  | 'preparacion_invalida'
  | 'programacion_inexistente'
  | 'programacion_conflicto'
  | 'programacion_no_reprogramable'
  | 'programacion_duplicada'
  | 'orden_partida_inconsistente'
  | 'partida_inexistente'
  | 'recurso_inexistente'
  | 'recurso_inactivo'
  | 'recurso_ocupado'
  | 'capacidad_no_disponible'
  | 'capacidad_insuficiente'
  | 'transicion_preparacion_no_permitida'
  | 'rango_fechas_invalido'
  | 'desconocido';

export class ErrorPlaneacion extends Error {
  constructor(
    public readonly codigo: CodigoErrorPlaneacion,
    mensaje?: string,
  ) {
    super(mensaje ?? codigo);
    this.name = 'ErrorPlaneacion';
  }
}

export type ProgramacionActualizada = {
  id: string;
  estadoPlaneacion: EstadoPlaneacion;
  actualizadoEn: string;
};

export type ReprogramarPartidaRecursoEntrada = {
  programacionId: string;
  recursoId: string;
  fechaProgramada: string;
  turno: TurnoPlaneacion;
  horasEstimadas: number;
  ordenPrioridad: number;
  actualizadoEnEsperado: string;
};

export type FiltrosCalendarioPlaneacion = {
  fechaInicio: string;
  fechaFin: string;
  recursoId?: string;
  estados?: readonly EstadoPlaneacion[];
};

/** Proyección de calendario: una sola lectura de recursos, carga y programaciones. */
export type DatosCalendarioPlaneacion = {
  recursos: RecursoPlaneacion[];
  cargas: CargaCapacidadDiaria[];
  programaciones: ProgramacionArea[];
};

function codigoDesdeMensaje(mensaje: string): CodigoErrorPlaneacion {
  const codigos: readonly CodigoErrorPlaneacion[] = [
    'programacion_invalida',
    'reprogramacion_invalida',
    'preparacion_invalida',
    'programacion_inexistente',
    'programacion_conflicto',
    'programacion_no_reprogramable',
    'programacion_duplicada',
    'orden_partida_inconsistente',
    'partida_inexistente',
    'recurso_inexistente',
    'recurso_inactivo',
    'recurso_ocupado',
    'capacidad_no_disponible',
    'capacidad_insuficiente',
    'transicion_preparacion_no_permitida',
    'rango_fechas_invalido',
  ];

  return codigos.find((codigo) => mensaje.includes(codigo)) ?? 'desconocido';
}

function lanzarErrorPlaneacion(mensaje: string | undefined): never {
  throw new ErrorPlaneacion(codigoDesdeMensaje(mensaje ?? ''), mensaje);
}

function estadoPlaneacionDeBase(estado: string): EstadoPlaneacion {
  if (!ESTADOS_PLANEACION.includes(estado as EstadoPlaneacion)) {
    throw new ErrorPlaneacion('desconocido', 'Estado de Planeación inválido devuelto por la base de datos');
  }

  return estado as EstadoPlaneacion;
}

function programacionActualizadaDesdeRpc(fila: {
  id: string;
  estado_planeacion: string;
  actualizado_en: string;
} | null): ProgramacionActualizada {
  if (!fila?.id || !fila.actualizado_en) {
    throw new ErrorPlaneacion('desconocido');
  }

  return {
    id: fila.id,
    estadoPlaneacion: estadoPlaneacionDeBase(fila.estado_planeacion),
    actualizadoEn: fila.actualizado_en,
  };
}

/** Programa una partida mediante la RPC que bloquea capacidad dentro de PostgreSQL. */
export async function programarPartidaRecursoServicio(
  admin: SupabaseClient<Database>,
  entrada: ProgramarOrdenInput,
): Promise<ProgramacionActualizada> {
  const { data, error } = await admin.rpc('programar_partida_recurso', {
    p_orden_id: entrada.ordenId,
    p_partida_id: entrada.partidaId,
    p_recurso_id: entrada.recursoId,
    p_secuencia: entrada.secuencia,
    p_fecha_programada: entrada.fechaProgramada,
    p_turno: entrada.turno,
    p_horas_estimadas: entrada.horasEstimadas,
    p_orden_prioridad: entrada.ordenPrioridad,
  });

  if (error) lanzarErrorPlaneacion(error.message);
  return programacionActualizadaDesdeRpc(data?.[0] ?? null);
}

/** Reprograma con compare-and-set para no sobrescribir una pantalla obsoleta. */
export async function reprogramarPartidaRecursoServicio(
  admin: SupabaseClient<Database>,
  entrada: ReprogramarPartidaRecursoEntrada,
): Promise<ProgramacionActualizada> {
  const { data, error } = await admin.rpc('reprogramar_partida_recurso', {
    p_programacion_id: entrada.programacionId,
    p_recurso_id: entrada.recursoId,
    p_fecha_programada: entrada.fechaProgramada,
    p_turno: entrada.turno,
    p_horas_estimadas: entrada.horasEstimadas,
    p_orden_prioridad: entrada.ordenPrioridad,
    p_actualizado_en_esperado: entrada.actualizadoEnEsperado,
  });

  if (error) lanzarErrorPlaneacion(error.message);
  return programacionActualizadaDesdeRpc(data?.[0] ?? null);
}

/** Activa preparación; no acepta un actor controlado por el navegador. */
export async function activarModoPreparacionServicio(
  admin: SupabaseClient<Database>,
  entrada: Pick<CambiarModoPreparacionInput, 'programacionId' | 'actualizadoEnEsperado'>,
): Promise<ProgramacionActualizada> {
  const { data, error } = await admin.rpc('activar_modo_preparacion', {
    p_programacion_id: entrada.programacionId,
    p_actualizado_en_esperado: entrada.actualizadoEnEsperado,
  });

  if (error) lanzarErrorPlaneacion(error.message);
  return programacionActualizadaDesdeRpc(data?.[0] ?? null);
}

/**
 * Consulta capacidad efectiva calculada en Postgres. La función devuelve todos
 * los turnos configurados del rango, incluso cuando aún no tienen programación.
 */
export async function obtenerCargaCapacidadDiariaServicio(
  admin: SupabaseClient<Database>,
  fechaInicio: string,
  fechaFin: string,
): Promise<CargaCapacidadDiaria[]> {
  const { data, error } = await admin.rpc('obtener_carga_capacidad_diaria', {
    p_fecha_inicio: fechaInicio,
    p_fecha_fin: fechaFin,
  });

  if (error) lanzarErrorPlaneacion(error.message);
  return (data ?? []).map(filaACargaCapacidadDiaria);
}

/** Lee el calendario bajo el alcance RLS del cliente recibido, sin consultas N+1. */
export async function obtenerProgramacionesCalendarioServicio(
  cliente: SupabaseClient<Database>,
  filtros: FiltrosCalendarioPlaneacion,
): Promise<ProgramacionArea[]> {
  let consulta = cliente
    .from('programacion_areas')
    .select('*')
    .gte('fecha_programada', filtros.fechaInicio)
    .lte('fecha_programada', filtros.fechaFin);

  if (filtros.recursoId) {
    consulta = consulta.eq('recurso_id', filtros.recursoId);
  }
  if (filtros.estados && filtros.estados.length > 0) {
    consulta = consulta.in('estado_planeacion', filtros.estados);
  }

  const { data, error } = await consulta
    .order('fecha_programada', { ascending: true })
    .order('turno', { ascending: true })
    .order('orden_prioridad', { ascending: true });

  if (error) lanzarErrorPlaneacion(error.message);
  return (data ?? []).map(filaAProgramacionArea);
}

/**
 * Compone el calendario dentro del servidor. El cliente RLS gobierna recursos y
 * programaciones; la carga calculada usa la RPC privilegiada solo después de la
 * autorización de la Server Action llamadora.
 */
export async function obtenerDatosCalendarioPlaneacionServicio(
  cliente: SupabaseClient<Database>,
  admin: SupabaseClient<Database>,
  filtros: FiltrosCalendarioPlaneacion,
): Promise<DatosCalendarioPlaneacion> {
  const [programaciones, respuestaRecursos] = await Promise.all([
    obtenerProgramacionesCalendarioServicio(cliente, filtros),
    cliente.from('recursos_planeacion').select('*').eq('activo', true).order('codigo'),
  ]);

  if (respuestaRecursos.error) lanzarErrorPlaneacion(respuestaRecursos.error.message);

  const recursos = (respuestaRecursos.data ?? []).map(filaARecursoPlaneacion);
  const recursosAutorizados = new Set(recursos.map((recurso) => recurso.id));
  const cargas = await obtenerCargaCapacidadDiariaServicio(
    admin,
    filtros.fechaInicio,
    filtros.fechaFin,
  );

  return {
    recursos,
    // La RPC de carga se ejecuta con service_role porque agrega capacidad; se
    // vuelve a acotar a los recursos que RLS permiti\u00f3 leer. De otro modo, una
    // pol\u00edtica futura m\u00e1s restrictiva en recursos filtrar\u00eda las filas visibles
    // pero dejar\u00eda metadatos de capacidad de otros recursos en la respuesta.
    cargas: cargas.filter((carga) => recursosAutorizados.has(carga.recursoId)),
    programaciones,
  };
}

/** Mensajes estables para Server Actions; el detalle PostgreSQL queda en el log interno. */
export function mensajeErrorPlaneacion(error: unknown, accion: 'programar' | 'reprogramar' | 'preparar'): string {
  if (!(error instanceof ErrorPlaneacion)) {
    return 'No se pudo actualizar la programación';
  }

  switch (error.codigo) {
    case 'capacidad_insuficiente':
    case 'capacidad_no_disponible':
      return 'El recurso no tiene capacidad disponible en el turno seleccionado';
    case 'recurso_ocupado':
      return 'El recurso ya está ocupado en preparación o producción';
    case 'programacion_conflicto':
      return 'La programación fue modificada por otro usuario. Recarga e inténtalo de nuevo';
    case 'programacion_inexistente':
    case 'partida_inexistente':
    case 'recurso_inexistente':
      return 'La programación o el recurso ya no están disponibles';
    case 'orden_partida_inconsistente':
      return 'La partida no pertenece a la orden seleccionada';
    case 'programacion_duplicada':
      return 'La partida ya tiene una programación equivalente';
    default:
      return accion === 'programar'
        ? 'No se pudo programar la partida'
        : accion === 'reprogramar'
          ? 'No se pudo reprogramar la partida'
          : 'No se pudo activar la preparación';
  }
}
