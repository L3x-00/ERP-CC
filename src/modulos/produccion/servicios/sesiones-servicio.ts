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
  | 'proceso_previo_sin_piezas'
  | 'cantidad_excede_disponible_proceso'
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
  | 'horas_extra_no_requeridas'
  | 'solicitud_no_pendiente'
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
  | 'cierre_integrado_invalido'
  | 'item_fuera_de_corrida'
  | 'item_principal_requerido'
  | 'minutos_exceden_sesion'
  | 'sin_permiso_cierre_integrado'
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
  'proceso_previo_sin_piezas',
  'cantidad_excede_disponible_proceso',
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
  'horas_extra_no_requeridas',
  'solicitud_no_pendiente',
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
  'cierre_integrado_invalido',
  'item_fuera_de_corrida',
  'item_principal_requerido',
  'minutos_exceden_sesion',
  'sin_permiso_cierre_integrado',
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
  entrada: Omit<CerrarSesionInput, 'pinConfirmacion'> & {
    operadorId: string;
    /** El PIN lo valida la Server Action del operador; el servicio no lo usa. */
    pinConfirmacion?: string;
  },
): Promise<CierreSesionRegistrado> {
  if (entrada.estadoDestino === 'finalizada' && !entrada.consumo) {
    throw new ErrorProduccion(
      'cierre_sesion_invalido',
      'El consumo de material es obligatorio para finalizar la sesión',
    );
  }

  if (entrada.estadoDestino === 'finalizada' && entrada.itemsIntegrados
      && entrada.itemsIntegrados.length > 0) {
    const { data, error } = await admin.rpc('cerrar_sesion_integrada', {
      p_sesion_id: entrada.sesionId,
      p_items: entrada.itemsIntegrados.map((item) => ({
        partida_id: item.partidaId,
        piezas: item.piezas,
        minutos: item.minutos,
      })),
      p_material_id: entrada.consumo!.materialId,
      p_cantidad_usada: entrada.consumo!.cantidadUsada,
      p_cantidad_scrap: entrada.consumo!.cantidadScrap,
      p_notas: entrada.notas ?? '',
      p_actor_id: entrada.operadorId,
    });
    if (error) lanzarErrorProduccion(error.message);

    const payload = (data ?? {}) as Record<string, unknown>;
    const cierre = (payload.cierre ?? {}) as Record<string, unknown>;
    if (!cierre.id || !cierre.actualizado_en) throw new ErrorProduccion('desconocido');
    return {
      id: String(cierre.id),
      estadoSesion: estadoSesionDesdeBase(String(cierre.estado_sesion)),
      horasBrutas: Number(cierre.horas_brutas),
      horasNetas: Number(cierre.horas_netas),
      piezasProducidas: Number(cierre.piezas_producidas),
      cantidadProducidaPartida: Number(cierre.cantidad_producida_partida),
      estadoOrden: String(cierre.estado_orden),
      estadoPlaneacion: estadoPlaneacionDesdeBase(String(cierre.estado_planeacion)),
      actualizadoEn: String(cierre.actualizado_en),
    };
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
      return 'Esa operación ya tiene una sesión activa en el recurso; espera a que se cierre o elige otra.';
    case 'programacion_no_preparada':
      return 'La programación debe estar en preparación antes de iniciar';
    case 'secuencia_previa_pendiente':
      return 'Existe una operación previa pendiente para esta partida';
    case 'proceso_previo_sin_piezas':
      return 'El proceso anterior aún no tiene piezas terminadas para trabajar';
    case 'cantidad_excede_disponible_proceso':
      return 'La cantidad supera las piezas terminadas y disponibles del proceso anterior';
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
      return 'El tiempo neto de la sesión supera la jornada del turno. Enviamos la solicitud a un responsable; espera a que la apruebe y vuelve a cerrar.';
    case 'horas_extra_no_requeridas':
      return 'La sesión no excede la jornada del turno, así que no requiere horas extra.';
    case 'solicitud_no_pendiente':
      return 'La solicitud de horas extra ya fue resuelta o no existe; actualiza la lista.';
    case 'cierre_integrado_invalido':
      return 'La corrida integrada requiere ítems con piezas y minutos válidos';
    case 'item_fuera_de_corrida':
      return 'Uno de los ítems no pertenece a esta corrida; actualiza la lista';
    case 'item_principal_requerido':
      return 'El cierre integrado debe incluir el ítem de la sesión';
    case 'minutos_exceden_sesion':
      return 'Los minutos por ítem superan el tiempo transcurrido de la sesión';
    case 'sin_permiso_cierre_integrado':
      return 'No tienes permiso para cerrar esta corrida integrada';
    case 'corrida_invalida':
    case 'corrida_item_no_incluye_partida':
      return 'La corrida no corresponde a esta partida';
    case 'corrida_sin_pendiente':
      return 'La partida no tiene cantidad pendiente para una corrida';
    case 'corrida_no_iniciable':
      return 'La corrida no puede iniciarse desde su estado actual';
    case 'corrida_no_completable':
      return 'La corrida debe estar en proceso o pausada antes de completarla';
    case 'corrida_no_cancelable':
      return 'La corrida ya no puede cancelarse desde su estado actual';
    case 'corrida_con_sesiones_abiertas':
      return 'Cierra o pausa las sesiones activas antes de completar la corrida';
    case 'corrida_items_incompletos':
      return 'Aún hay piezas pendientes en la corrida; registra su avance antes de completarla';
    case 'corrida_con_avance':
      return 'La corrida ya tiene avance registrado y no puede cancelarse';
    case 'corrida_inexistente':
      return 'La corrida ya no existe o no está disponible';
    case 'sin_permiso_corrida':
      return 'No tienes permiso para administrar esta corrida';
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
