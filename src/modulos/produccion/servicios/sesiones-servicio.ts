import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import type { EstadoPlaneacion } from '@/modulos/planeacion/tipos/indice';
import {
  ESTADOS_SESION_TRABAJO,
  filaASesionTrabajo,
  type EstadoSesionTrabajo,
  type SesionTrabajo,
} from '@/modulos/produccion/tipos/indice';
import type { CerrarSesionInput, IniciarSesionInput } from '@/modulos/produccion/validaciones/indice';

export type CodigoErrorProduccion =
  | 'inicio_sesion_invalido'
  | 'cierre_sesion_invalido'
  | 'sesion_no_activa'
  | 'orden_partida_inconsistente'
  | 'orden_no_iniciable'
  | 'orden_no_en_proceso'
  | 'operador_no_activo'
  | 'operador_no_asignado_partida'
  | 'operador_o_programacion_con_sesion_activa'
  | 'programacion_inexistente'
  | 'programacion_no_preparada'
  | 'programacion_no_en_proceso'
  | 'recurso_no_disponible'
  | 'recurso_inexistente'
  | 'secuencia_previa_pendiente'
  | 'produccion_solo_ultima_secuencia'
  | 'cantidad_producida_excede_solicitada'
  | 'motivo_pausa_invalido'
  | 'desconocido';

export class ErrorProduccion extends Error {
  constructor(
    public readonly codigo: CodigoErrorProduccion,
    mensaje?: string,
  ) {
    super(mensaje ?? codigo);
    this.name = 'ErrorProduccion';
  }
}

export interface CierreSesionRegistrado {
  id: string;
  estadoSesion: EstadoSesionTrabajo;
  horasBrutas: number;
  horasNetas: number;
  piezasProducidas: number;
  cantidadProducidaPartida: number;
  estadoOrden: string;
  estadoPlaneacion: EstadoPlaneacion;
  actualizadoEn: string;
}

const CODIGOS_ERROR: readonly CodigoErrorProduccion[] = [
  'inicio_sesion_invalido',
  'cierre_sesion_invalido',
  'sesion_no_activa',
  'orden_partida_inconsistente',
  'orden_no_iniciable',
  'orden_no_en_proceso',
  'operador_no_activo',
  'operador_no_asignado_partida',
  'operador_o_programacion_con_sesion_activa',
  'programacion_inexistente',
  'programacion_no_preparada',
  'programacion_no_en_proceso',
  'recurso_no_disponible',
  'recurso_inexistente',
  'secuencia_previa_pendiente',
  'produccion_solo_ultima_secuencia',
  'cantidad_producida_excede_solicitada',
  'motivo_pausa_invalido',
];

function lanzarErrorProduccion(mensaje: string | undefined): never {
  const codigo = CODIGOS_ERROR.find((actual) => mensaje?.includes(actual)) ?? 'desconocido';
  throw new ErrorProduccion(codigo, mensaje);
}

function estadoSesionDesdeBase(estado: string): EstadoSesionTrabajo {
  if (!ESTADOS_SESION_TRABAJO.includes(estado as EstadoSesionTrabajo)) {
    throw new ErrorProduccion('desconocido', 'Estado de sesión inválido devuelto por la base de datos');
  }
  return estado as EstadoSesionTrabajo;
}

function estadoPlaneacionDesdeBase(estado: string): EstadoPlaneacion {
  const estados: readonly EstadoPlaneacion[] = [
    'programada', 'en_preparacion', 'en_proceso', 'bloqueada', 'completada', 'cancelada',
  ];
  if (!estados.includes(estado as EstadoPlaneacion)) {
    throw new ErrorProduccion('desconocido', 'Estado de planeación inválido devuelto por la base de datos');
  }
  return estado as EstadoPlaneacion;
}

/** Abre una sesión tomando únicamente una programación ya preparada. */
export async function iniciarSesionTrabajoServicio(
  admin: SupabaseClient<Database>,
  entrada: IniciarSesionInput & { operadorId: string },
): Promise<Pick<SesionTrabajo, 'id' | 'ordenId' | 'partidaId' | 'programacionId' | 'operadorId' | 'fechaInicio' | 'estadoSesion' | 'creadoEn' | 'actualizadoEn'>> {
  const { data, error } = await admin.rpc('iniciar_sesion_trabajo_operador', {
    p_orden_id: entrada.ordenId,
    p_partida_id: entrada.partidaId,
    p_programacion_id: entrada.programacionId,
    p_operador_id: entrada.operadorId,
  });
  if (error) lanzarErrorProduccion(error.message);
  const fila = data?.[0];
  if (!fila?.id || !fila.actualizado_en) throw new ErrorProduccion('desconocido');

  return {
    id: fila.id,
    ordenId: fila.orden_id,
    partidaId: fila.partida_id,
    programacionId: fila.programacion_id,
    operadorId: fila.operador_id,
    fechaInicio: fila.fecha_inicio,
    estadoSesion: estadoSesionDesdeBase(fila.estado_sesion),
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}

/** Cierra o pausa en PostgreSQL; el reloj, producción y recurso no vienen del cliente. */
export async function cerrarSesionTrabajoServicio(
  admin: SupabaseClient<Database>,
  entrada: CerrarSesionInput & { operadorId: string },
): Promise<CierreSesionRegistrado> {
  const { data, error } = await admin.rpc('cerrar_sesion_trabajo_operador', {
    p_sesion_id: entrada.sesionId,
    p_operador_id: entrada.operadorId,
    p_piezas_producidas: entrada.piezasProducidas,
    p_estado_destino: entrada.estadoDestino,
    ...(entrada.motivoPausa ? { p_motivo_pausa: entrada.motivoPausa } : {}),
    ...(entrada.notas ? { p_notas: entrada.notas } : {}),
  });
  if (error) lanzarErrorProduccion(error.message);
  const fila = data?.[0];
  if (!fila?.id || !fila.actualizado_en) throw new ErrorProduccion('desconocido');

  return {
    id: fila.id,
    estadoSesion: estadoSesionDesdeBase(fila.estado_sesion),
    horasBrutas: Number(fila.horas_brutas),
    horasNetas: Number(fila.horas_netas),
    piezasProducidas: Number(fila.piezas_producidas),
    cantidadProducidaPartida: Number(fila.cantidad_producida_partida),
    estadoOrden: fila.estado_orden,
    estadoPlaneacion: estadoPlaneacionDesdeBase(fila.estado_planeacion),
    actualizadoEn: fila.actualizado_en,
  };
}

export function mensajeErrorSesion(error: unknown): string {
  if (!(error instanceof ErrorProduccion)) return 'No se pudo registrar la sesión de producción';

  switch (error.codigo) {
    case 'operador_o_programacion_con_sesion_activa':
      return 'El operador o el recurso ya tienen una sesión activa';
    case 'programacion_no_preparada':
      return 'La programación debe estar en preparación antes de iniciar';
    case 'secuencia_previa_pendiente':
      return 'Existe una operación previa pendiente para esta partida';
    case 'cantidad_producida_excede_solicitada':
      return 'La producción no puede superar la cantidad solicitada';
    case 'sesion_no_activa':
      return 'La sesión ya fue actualizada o no está disponible';
    default:
      return 'No se pudo registrar la sesión de producción';
  }
}

export { filaASesionTrabajo };
