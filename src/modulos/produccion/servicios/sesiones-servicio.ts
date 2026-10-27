import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import type { EstadoPlaneacion } from '@/modulos/planeacion/tipos/indice';
import {
  ESTADOS_SESION_TRABAJO,
  filaASesionTrabajo,
  type EstadoSesionTrabajo,
  type SesionTrabajo,
} from '@/modulos/produccion/tipos/indice';
import type { CerrarSesionInput, IniciarSesionInput, ReanudarSesionInput } from '@/modulos/produccion/validaciones/indice';

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
  | 'meta_proceso_no_corresponde'
  | 'cantidad_excede_meta_proceso'
  | 'motivo_pausa_invalido'
  | 'cantidad_entrega_excede_producida'
  | 'orden_no_entregable'
  | 'partida_no_corresponde_orden'
  | 'reanudacion_invalida'
  | 'orden_no_reanudable'
  | 'programacion_no_bloqueada'
  | 'programacion_conflicto'
  | 'sesion_pausada_inexistente'
  | 'recurso_ocupado'
  | 'capacidad_no_disponible'
  | 'verificacion_inicio_incompleta'
  | 'nota_pausa_requerida'
  | 'primera_pieza_pendiente'
  | 'horas_extra_sin_autorizacion'
  | 'corrida_invalida'
  | 'corrida_item_no_incluye_partida'
  | 'corrida_sin_pendiente'
  | 'corrida_sin_proceso_disponible'
  | 'corrida_items_otra_orden'
  | 'corrida_items_incompatibles'
  | 'corrida_cantidad_invalida'
  | 'corrida_item_duplicado'
  | 'corrida_partida_inexistente'
  | 'corrida_inexistente'
  | 'corrida_no_iniciable'
  | 'corrida_no_completable'
  | 'corrida_no_cancelable'
  | 'corrida_con_sesiones_abiertas'
  | 'corrida_items_incompletos'
  | 'corrida_con_avance'
  | 'sin_permiso_corrida'
  | 'sin_permiso_calidad'
  | 'sin_permiso_horas_extra'
  | 'sin_permiso_cerrar_jornada'
  | 'sin_permiso_reclamar_recurso'
  | 'referencia_lote_invalida'
  | 'inspeccion_invalida'
  | 'orden_no_autorizable'
  | 'sesion_no_corresponde'
  | 'fecha_jornada_invalida'
  | 'sin_sesion_liberable'
  | 'proceso_invalido'
  | 'orden_inexistente'
  | 'partida_no_corresponde'
  | 'corrida_no_corresponde'
  | 'orden_no_creable_corrida'
  | 'motivo_requerido'
  | 'reclamo_invalido'
  | 'reclamo_no_activo'
  | 'reclamo_otro_operador'
  | 'reclamo_ya_preparado'
  | 'proceso_excede_jornada'
  | 'capacidad_diaria_insuficiente'
  | 'proceso_ya_reclamado'
  | 'partida_asignada_otro_operador'
  | 'orden_no_reclamable'
  | 'orden_pendiente_liberacion'
  | 'proceso_completado'
  | 'proceso_pausado_reanudar'
  | 'proceso_pausado_no_liberable'
  | 'proceso_en_proceso_no_liberable'
  | 'programacion_ya_en_proceso'
  | 'sin_recurso_disponible'
  | 'operador_area_no_asignada'
  | 'corrida_ambigua'
  | 'cantidad_consumo_invalida'
  | 'material_no_corresponde_partida'
  | 'material_inexistente_o_inactivo'
  | 'costo_material_no_configurado'
  | 'tipo_cambio_no_configurado'
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
  'meta_proceso_no_corresponde',
  'cantidad_excede_meta_proceso',
  'motivo_pausa_invalido',
  'cantidad_entrega_excede_producida',
  'orden_no_entregable',
  'partida_no_corresponde_orden',
  'reanudacion_invalida',
  'orden_no_reanudable',
  'programacion_no_bloqueada',
  'programacion_conflicto',
  'sesion_pausada_inexistente',
  'recurso_ocupado',
  'capacidad_no_disponible',
  'verificacion_inicio_incompleta',
  'nota_pausa_requerida',
  'primera_pieza_pendiente',
  'horas_extra_sin_autorizacion',
  'corrida_invalida',
  'corrida_item_no_incluye_partida',
  'corrida_sin_pendiente',
  'corrida_sin_proceso_disponible',
  'corrida_items_otra_orden',
  'corrida_items_incompatibles',
  'corrida_cantidad_invalida',
  'corrida_item_duplicado',
  'corrida_partida_inexistente',
  'corrida_inexistente',
  'corrida_no_iniciable',
  'corrida_no_completable',
  'corrida_no_cancelable',
  'corrida_con_sesiones_abiertas',
  'corrida_items_incompletos',
  'corrida_con_avance',
  'sin_permiso_corrida',
  'sin_permiso_calidad',
  'sin_permiso_horas_extra',
  'sin_permiso_cerrar_jornada',
  'sin_permiso_reclamar_recurso',
  'referencia_lote_invalida',
  'inspeccion_invalida',
  'orden_no_autorizable',
  'sesion_no_corresponde',
  'fecha_jornada_invalida',
  'sin_sesion_liberable',
  'proceso_invalido',
  'orden_inexistente',
  'partida_no_corresponde',
  'corrida_no_corresponde',
  'orden_no_creable_corrida',
  'motivo_requerido',
  'reclamo_invalido',
  'reclamo_no_activo',
  'reclamo_otro_operador',
  'reclamo_ya_preparado',
  'proceso_excede_jornada',
  'capacidad_diaria_insuficiente',
  'proceso_ya_reclamado',
  'partida_asignada_otro_operador',
  'orden_no_reclamable',
  'orden_pendiente_liberacion',
  'proceso_completado',
  'proceso_pausado_reanudar',
  'proceso_pausado_no_liberable',
  'proceso_en_proceso_no_liberable',
  'programacion_ya_en_proceso',
  'sin_recurso_disponible',
  'operador_area_no_asignada',
  'corrida_ambigua',
  'cantidad_consumo_invalida',
  'material_no_corresponde_partida',
  'material_inexistente_o_inactivo',
  'costo_material_no_configurado',
  'tipo_cambio_no_configurado',
];

/** Traduce el mensaje de una RPC a un error tipado de producción. */
export function lanzarErrorProduccion(mensaje: string | undefined): never {
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

type SesionIniciada = Pick<SesionTrabajo,
  'id' | 'ordenId' | 'partidaId' | 'programacionId' | 'operadorId' |
  'fechaInicio' | 'estadoSesion' | 'creadoEn' | 'actualizadoEn'>;

export type { SesionIniciada };

export function sesionIniciadaDesdeRpc(fila: {
  id: string; orden_id: string; partida_id: string; programacion_id: string;
  operador_id: string; fecha_inicio: string; estado_sesion: string;
  creado_en: string; actualizado_en: string;
} | null): SesionIniciada {
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

/** Abre una sesión tomando únicamente una programación ya preparada. */
export async function iniciarSesionTrabajoServicio(
  admin: SupabaseClient<Database>,
  entrada: IniciarSesionInput & { operadorId: string },
): Promise<SesionIniciada> {
  const { data, error } = await admin.rpc('iniciar_sesion_trabajo_operador', {
    p_orden_id: entrada.ordenId,
    p_partida_id: entrada.partidaId,
    p_programacion_id: entrada.programacionId,
    p_operador_id: entrada.operadorId,
    ...(entrada.verificacion ? { p_verificacion: entrada.verificacion } : {}),
    ...(entrada.corridaId ? { p_corrida_id: entrada.corridaId } : {}),
  });
  if (error) lanzarErrorProduccion(error.message);
  return sesionIniciadaDesdeRpc(data?.[0] ?? null);
}

/** Libera una pausa y vuelve a tomar el recurso en una única transacción SQL. */
export async function reanudarSesionTrabajoServicio(
  admin: SupabaseClient<Database>, entrada: ReanudarSesionInput & { operadorId: string },
): Promise<SesionIniciada> {
  const { data, error } = await admin.rpc('reanudar_sesion_trabajo_a20', {
    p_orden_id: entrada.ordenId,
    p_partida_id: entrada.partidaId,
    p_programacion_id: entrada.programacionId,
    p_actualizado_en_esperado: entrada.actualizadoEnEsperado,
    p_operador_id: entrada.operadorId,
  });
  if (error) lanzarErrorProduccion(error.message);
  return sesionIniciadaDesdeRpc(data?.[0] ?? null);
}

/** Cierra o pausa en PostgreSQL; el reloj, producción y recurso no vienen del cliente. */
export async function cerrarSesionTrabajoServicio(
  admin: SupabaseClient<Database>,
  entrada: CerrarSesionInput & { operadorId: string },
): Promise<CierreSesionRegistrado> {
  if (entrada.estadoDestino === 'finalizada' && !entrada.consumo) {
    throw new ErrorProduccion(
      'cierre_sesion_invalido',
      'El consumo de material es obligatorio para finalizar la sesión',
    );
  }

  const { data, error } =
    entrada.estadoDestino === 'finalizada' && entrada.consumo
      ? await admin.rpc('cerrar_sesion_con_consumo_operador', {
          p_sesion_id: entrada.sesionId,
          p_operador_id: entrada.operadorId,
          p_piezas_producidas: entrada.piezasProducidas,
          p_material_id: entrada.consumo.materialId,
          p_cantidad_usada: entrada.consumo.cantidadUsada,
          p_cantidad_scrap: entrada.consumo.cantidadScrap,
          p_meta_proceso_id: entrada.metaProcesoId ?? null,
          p_notas: entrada.notas ?? null,
        })
      : await admin.rpc('cerrar_sesion_trabajo_operador', {
          p_sesion_id: entrada.sesionId,
          p_operador_id: entrada.operadorId,
          p_piezas_producidas: entrada.piezasProducidas,
          p_estado_destino: entrada.estadoDestino,
          ...(entrada.metaProcesoId
            ? { p_meta_proceso_id: entrada.metaProcesoId }
            : {}),
          ...(entrada.motivoPausa
            ? { p_motivo_pausa: entrada.motivoPausa }
            : {}),
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
    case 'cierre_sesion_invalido':
      return 'El cierre requiere datos válidos y consumo de material al finalizar';
    case 'operador_o_programacion_con_sesion_activa':
      return 'El operador o el recurso ya tienen una sesión activa';
    case 'programacion_no_preparada':
      return 'La programación debe estar en preparación antes de iniciar';
    case 'secuencia_previa_pendiente':
      return 'Existe una operación previa pendiente para esta partida';
    case 'cantidad_producida_excede_solicitada':
      return 'La producción no puede superar la cantidad solicitada';
    case 'meta_proceso_no_corresponde':
      return 'El proceso elegido no pertenece a esta partida';
    case 'cantidad_excede_meta_proceso':
      return 'La cantidad supera lo pendiente de esa meta de proceso';
    case 'sesion_no_activa':
      return 'La sesión ya fue actualizada o no está disponible';
    case 'programacion_conflicto':
      return 'La pausa cambió en otra pantalla; actualiza el tablero';
    case 'recurso_ocupado':
      return 'El recurso está ocupado; vuelve a intentarlo cuando esté libre';
    case 'capacidad_no_disponible':
      return 'La capacidad del recurso ya no permite reanudar';
    case 'programacion_no_bloqueada':
    case 'sesion_pausada_inexistente':
    case 'orden_no_reanudable':
      return 'La orden ya no está pausada o no puede reanudarse';
    case 'verificacion_inicio_incompleta':
      return 'Completa el checklist de eventos críticos para iniciar';
    case 'nota_pausa_requerida':
      return 'Este motivo de pausa exige una nota';
    case 'primera_pieza_pendiente':
      return 'Falta liberar la primera pieza antes de declarar producción';
    case 'horas_extra_sin_autorizacion':
      return 'El cierre excede la jornada configurada y requiere autorización de horas extra';
    case 'corrida_invalida':
    case 'corrida_item_no_incluye_partida':
      return 'La corrida no corresponde a esta partida';
    case 'corrida_sin_pendiente':
      return 'La partida no tiene cantidad pendiente para una corrida';
    case 'motivo_requerido':
      return 'El motivo es obligatorio (mínimo 3 caracteres)';
    case 'reclamo_invalido':
      return 'Los datos del reclamo no son válidos';
    case 'reclamo_no_activo':
      return 'El reclamo ya no está activo; actualiza el tablero';
    case 'reclamo_otro_operador':
      return 'Ese proceso lo tiene otro operador';
    case 'reclamo_ya_preparado':
      return 'El proceso ya está preparado: solo puedes continuar la sesión';
    case 'proceso_excede_jornada':
      return 'El proceso requiere más de 8 h y no cabe en una jornada';
    case 'capacidad_diaria_insuficiente':
      return 'Ese día ya no tiene horas libres suficientes (máximo 8 h)';
    case 'proceso_ya_reclamado':
      return 'Otro operador acaba de tomar este proceso';
    case 'partida_asignada_otro_operador':
      return 'La partida ya está asignada a otro operador';
    case 'orden_no_reclamable':
      return 'La orden ya no está activa para producción';
    case 'orden_pendiente_liberacion':
      return 'La orden aún no se libera a Bandeja; espera la liberación';
    case 'proceso_completado':
      return 'El proceso ya está completado';
    case 'proceso_pausado_reanudar':
      return 'El proceso está pausado: usa «Continuar sesión»';
    case 'proceso_pausado_no_liberable':
      return 'No puedes liberar un proceso pausado; reanúdalo o finalízalo';
    case 'proceso_en_proceso_no_liberable':
      return 'No puedes liberar un proceso que ya está en marcha';
    case 'programacion_ya_en_proceso':
      return 'Ese proceso ya tiene una sesión en marcha';
    case 'sin_recurso_disponible':
      return 'No hay recurso libre del área para esa fecha y turno';
    case 'operador_area_no_asignada':
      return 'Tu operador no está habilitado en el área de esta partida';
    case 'operador_no_activo':
      return 'El operador no está activo';
    case 'corrida_ambigua':
      return 'El operador tiene más de una corrida abierta; elige una en el panel';
    case 'cantidad_consumo_invalida':
      return 'La cantidad utilizada o la merma no son válidas';
    case 'material_no_corresponde_partida':
      return 'El material seleccionado no corresponde a la partida';
    case 'material_inexistente_o_inactivo':
      return 'El material seleccionado no está disponible';
    case 'costo_material_no_configurado':
      return 'El material no tiene costo confirmado';
    case 'tipo_cambio_no_configurado':
      return 'Configura el tipo de cambio USD antes de registrar el consumo';
    default:
      return 'No se pudo registrar la sesión de producción';
  }
}

export { filaASesionTrabajo };
