import type { SupabaseClient } from '@supabase/supabase-js';
import { describirErrorProduccion } from '@/modulos/produccion/utilidades/mensajes-error-produccion';
import type { Database } from '@/compartido/tipos/supabase';
import type { EstadoPlaneacion } from '@/modulos/planeacion/tipos/indice';
import {
  ESTADOS_SESION_TRABAJO,
  filaASesionTrabajo,
  type EstadoSesionTrabajo,
  type SesionTrabajo,
} from '@/modulos/produccion/tipos/indice';
import type { CerrarSesionInput, IniciarSesionInput, ReanudarSesionInput } from '@/modulos/produccion/validaciones/indice';
import { fechaHoraLocalTallerAIso } from '@/modulos/produccion/servicios/calculo-tiempos-servicio';

export type CodigoErrorProduccion =
  | 'inicio_sesion_invalido'
  | 'cierre_sesion_invalido'
  | 'cierre_consumo_invalido'
  | 'motivo_exceso_invalido'
  | 'proceso_corrida_no_corresponde'
  | 'material_no_corresponde_corrida'
  | 'sesion_no_activa'
  | 'sesion_partida_inconsistente'
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
  | 'consumo_piezas_invalido'
  | 'proceso_sin_piezas_previas'
  | 'consumo_piezas_menor_produccion'
  | 'meta_proceso_no_corresponde'
  | 'cantidad_excede_meta_proceso'
  | 'motivo_pausa_invalido'
  | 'cantidad_entrega_excede_producida'
  | 'cantidad_entrega_excede_pendiente'
  | 'partidas_entrega_invalidas'
  | 'orden_no_entregable'
  | 'partida_no_corresponde_orden'
  | 'reanudacion_invalida'
  | 'orden_no_reanudable'
  | 'programacion_no_bloqueada'
  | 'programacion_conflicto'
  | 'sesion_pausada_inexistente'
  | 'sesion_no_pausada'
  | 'pausa_ya_superada'
  | 'cierre_pausa_invalido'
  | 'hora_fin_invalida'
  | 'fecha_fin_futura'
  | 'fecha_fin_anterior_inicio'
  | 'actualizacion_avance_invalida'
  | 'sesion_no_pendiente_avance'
  | 'horas_a_restar_exceden_sesion'
  | 'horas_reales_exceden_sesion'
  | 'sesion_antigua_pendiente'
  | 'sesiones_pausadas_excedidas'
  | 'sin_permiso_actualizar_avance'
  | 'recurso_ocupado'
  | 'capacidad_no_disponible'
  | 'verificacion_inicio_incompleta'
  | 'nota_pausa_requerida'
  | 'primera_pieza_pendiente'
  | 'horas_extra_sin_autorizacion'
  | 'horas_extra_no_requeridas'
  | 'justificacion_horas_extra_invalida'
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
  | 'recurso_ya_reclamado'
  | 'conflicto_idempotencia'
  | 'sin_permiso_reabrir_operacion'
  | 'operacion_no_bloqueada'
  | 'sesion_pendiente'
  | 'sin_permiso_reasignar'
  | 'partida_con_sesion_activa'
  | 'operador_asignado_distinto'
  | 'partida_inexistente'
  | 'motivo_no_liberable'
  | 'pausa_reciente'
  | 'programacion_no_liberable'
  | 'reclamacion_invalida'
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
  | 'jornada_cerrada'
  | 'recurso_sin_equipos'
  | 'recurso_sin_capacidad'
  | 'recurso_capacidad_excedida'
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
  | 'consumo_material_requerido'
  | 'inspeccion_cierre_duplicada'
  | 'disposicion_calidad_incompleta'
  | 'disposicion_excede_conforme'
  | 'revalidacion_excede_pendiente'
  | 'revalidacion_no_aprobada'
  | 'revalidacion_sin_cantidad'
  | 'partida_requerida'
  | 'material_retrabajo_inexistente'
  | 'costo_retrabajo_no_configurado'
  | 'resultado_retrabajo_invalido'
  | 'solicitud_retrabajo_conflicto'
  | 'motivo_consumo_requerido'
  | 'setup_invalido'
  | 'minutos_setup_exceden_sesion'
  | 'sin_permiso_setup'
  | 'sesion_orden_inconsistente'
  | 'orden_no_terminada'
  | 'pausa_sin_corte'
  | 'pausa_huerfana_invalida'
  | 'motivo_cierre_invalido'
  | 'sin_permiso_cierre_pausa'
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
  'cierre_consumo_invalido',
  'motivo_exceso_invalido',
  'proceso_corrida_no_corresponde',
  'material_no_corresponde_corrida',
  'sesion_no_activa',
  'sesion_partida_inconsistente',
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
  'consumo_piezas_invalido',
  'proceso_sin_piezas_previas',
  'consumo_piezas_menor_produccion',
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
  'justificacion_horas_extra_invalida',
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
  'recurso_ya_reclamado',
  'sesion_no_pausada',
  'pausa_ya_superada',
  'conflicto_idempotencia',
  'sin_permiso_reabrir_operacion',
  'operacion_no_bloqueada',
  'sesion_pendiente',
  'sin_permiso_reasignar',
  'partida_con_sesion_activa',
  'operador_asignado_distinto',
  'partida_inexistente',
  'motivo_no_liberable',
  'pausa_reciente',
  'programacion_no_liberable',
  'reclamacion_invalida',
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
  'jornada_cerrada',
  'recurso_sin_equipos',
  'recurso_sin_capacidad',
  'recurso_capacidad_excedida',
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
  'consumo_material_requerido',
  'inspeccion_cierre_duplicada',
  'disposicion_calidad_incompleta',
  'disposicion_excede_conforme',
  'revalidacion_excede_pendiente',
  'revalidacion_no_aprobada',
  'revalidacion_sin_cantidad',
  'partida_requerida',
  'material_retrabajo_inexistente',
  'costo_retrabajo_no_configurado',
  'resultado_retrabajo_invalido',
  'solicitud_retrabajo_conflicto',
  'setup_invalido',
  'minutos_setup_exceden_sesion',
  'sin_permiso_setup',
  'hora_fin_invalida',
  'fecha_fin_futura',
  'fecha_fin_anterior_inicio',
  'actualizacion_avance_invalida',
  'sesion_no_pendiente_avance',
  'horas_a_restar_exceden_sesion',
  'horas_reales_exceden_sesion',
  'sesion_antigua_pendiente',
  'sesiones_pausadas_excedidas',
  'sin_permiso_actualizar_avance',
  'sesion_orden_inconsistente',
  'orden_no_terminada',
  'pausa_sin_corte',
  'pausa_huerfana_invalida',
  'motivo_cierre_invalido',
  'sin_permiso_cierre_pausa',
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

export interface ActualizarAvanceSesionInput {
  sesionId: string;
  actorId: string;
  piezasProducidas: number;
  /** C21: tiempo real que tardó el proceso en este bloque. */
  horasReales: number;
  notas?: string;
  materialId?: string | null;
  cantidadUsada?: number;
  cantidadScrap?: number;
  motivoConsumo?: string | null;
}

/** C20: guarda la hora real de finalización antes de cerrar la sesión. */
export async function registrarHoraFinSesionServicio(
  admin: SupabaseClient<Database>,
  entrada: { sesionId: string; operadorId: string; fechaFin: string },
): Promise<string> {
  const { data, error } = await admin.rpc('registrar_hora_fin_sesion', {
    p_sesion_id: entrada.sesionId,
    p_operador_id: entrada.operadorId,
    p_fecha_fin: entrada.fechaFin,
  });
  if (error) lanzarErrorProduccion(error.message);
  return String(data ?? entrada.fechaFin);
}

/** C20: descarta la hora declarada si el cierre falló, para no heredarla. */
export async function limpiarHoraFinSesionServicio(
  admin: SupabaseClient<Database>,
  entrada: { sesionId: string; operadorId: string },
): Promise<void> {
  const { error } = await admin.rpc('limpiar_hora_fin_sesion', {
    p_sesion_id: entrada.sesionId,
    p_operador_id: entrada.operadorId,
  });
  if (error) lanzarErrorProduccion(error.message);
}

/** C20: corrige piezas y hora real de una pausa automática por jornada. */
export async function actualizarAvanceSesionServicio(
  admin: SupabaseClient<Database>,
  entrada: ActualizarAvanceSesionInput,
): Promise<{
  id: string;
  estadoSesion: EstadoSesionTrabajo;
  fechaFin: string;
  horasNetas: number;
  piezasProducidas: number;
  estadoPlaneacion: EstadoPlaneacion;
  actualizadoEn: string;
}> {
  const { data, error } = await admin.rpc('actualizar_avance_sesion_pausada', {
    p_sesion_id: entrada.sesionId,
    p_actor_id: entrada.actorId,
    p_piezas_producidas: entrada.piezasProducidas,
    p_horas_reales: entrada.horasReales,
    ...(entrada.notas ? { p_notas: entrada.notas } : {}),
    ...(entrada.materialId
      ? {
          p_material_id: entrada.materialId,
          p_cantidad_usada: entrada.cantidadUsada ?? 0,
          p_cantidad_scrap: entrada.cantidadScrap ?? 0,
          p_motivo_consumo: entrada.motivoConsumo ?? 'Consumo registrado al actualizar avance',
        }
      : {}),
  });
  if (error) lanzarErrorProduccion(error.message);
  const fila = data?.[0];
  if (!fila || !fila.id || !fila.actualizado_en) {
    throw new ErrorProduccion('desconocido', 'No se pudo actualizar el avance de la sesión');
  }
  return {
    id: String(fila.id),
    estadoSesion: estadoSesionDesdeBase(String(fila.estado_sesion)),
    fechaFin: String(fila.fecha_fin),
    horasNetas: Number(fila.horas_netas),
    piezasProducidas: Number(fila.piezas_producidas),
    estadoPlaneacion: estadoPlaneacionDesdeBase(String(fila.estado_planeacion)),
    actualizadoEn: String(fila.actualizado_en),
  };
}

/** Cierra o pausa en PostgreSQL; el reloj, producción y recurso no vienen del cliente. */
export async function cerrarSesionTrabajoServicio(
  admin: SupabaseClient<Database>,
  entrada: CerrarSesionInput & {
    operadorId: string;
  },
): Promise<CierreSesionRegistrado> {
  // C20: si el operador declaró la hora real de fin, se guarda antes del cierre
  // para que la RPC calcule horas hasta ese instante y no hasta now().
  if (entrada.horaFin) {
    await registrarHoraFinSesionServicio(admin, {
      sesionId: entrada.sesionId,
      operadorId: entrada.operadorId,
      fechaFin: fechaHoraLocalTallerAIso(entrada.horaFin),
    });
  }

  if (entrada.minutosSetup !== undefined && entrada.minutosSetup > 0) {
    const { error: errorSetup } = await admin.rpc('registrar_setup_sesion_operador', {
      p_sesion_id: entrada.sesionId,
      p_operador_id: entrada.operadorId,
      p_minutos_setup: entrada.minutosSetup,
    });
    if (errorSetup) lanzarErrorProduccion(errorSetup.message);
  }

  if (entrada.estadoDestino === 'finalizada' && entrada.itemsIntegrados
      && entrada.itemsIntegrados.length > 0) {
    const { data, error } = await admin.rpc('cerrar_sesion_integrada', {
      p_sesion_id: entrada.sesionId,
      p_items: entrada.itemsIntegrados.map((item) => ({
        partida_id: item.partidaId,
        piezas: item.piezas,
        minutos: item.minutos ?? null,
      })),
      p_material_id: entrada.consumo?.materialId ?? null,
      p_cantidad_usada: entrada.consumo?.cantidadUsada ?? 0,
      p_cantidad_scrap: entrada.consumo?.cantidadScrap ?? 0,
      p_motivo_consumo: entrada.consumo?.motivo ?? '',
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
          p_motivo_consumo: entrada.consumo.motivo,
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

export type PausaCerradaRegistrada = {
  id: string;
  estadoSesion: 'finalizada';
  estadoPlaneacion: ReturnType<typeof estadoPlaneacionDesdeBase>;
  actualizadoEn: string;
};

/**
 * C15: una pausa que el operador no retomará se finaliza sin declarar piezas.
 * Conserva el corte, las horas y el motivo ya registrados al pausar, y devuelve
 * la operación al pool. No toca ninguna otra sesión de la orden.
 */
export async function cerrarPausaSinProducirServicio(
  admin: SupabaseClient<Database>,
  entrada: { sesionId: string; operadorId: string },
): Promise<PausaCerradaRegistrada> {
  const { data, error } = await admin.rpc('cerrar_pausa_sin_producir', {
    p_sesion_id: entrada.sesionId,
    p_operador_id: entrada.operadorId,
  });
  if (error) lanzarErrorProduccion(error.message);

  const fila = data?.[0];
  if (!fila?.id || !fila.actualizado_en) throw new ErrorProduccion('desconocido');

  return {
    id: fila.id,
    estadoSesion: 'finalizada',
    estadoPlaneacion: estadoPlaneacionDesdeBase(fila.estado_planeacion),
    actualizadoEn: fila.actualizado_en,
  };
}

export type ConsumoPiezasRegistrado = {
  id: string;
  cantidadConsumida: number;
  cantidadScrap: number;
};

/**
 * C17: registra las piezas del proceso anterior que consumió una sesión ya
 * cerrada. Es idempotente y descuenta la merma del inventario de piezas.
 */
export async function registrarConsumoPiezasSesionServicio(
  admin: SupabaseClient<Database>,
  entrada: {
    sesionId: string;
    operadorId: string;
    cantidadUsada: number;
    cantidadMerma: number;
    motivo: string;
  },
): Promise<ConsumoPiezasRegistrado> {
  const { data, error } = await admin.rpc('registrar_consumo_piezas_operador', {
    p_sesion_id: entrada.sesionId,
    p_operador_id: entrada.operadorId,
    p_cantidad_usada: entrada.cantidadUsada,
    p_cantidad_merma: entrada.cantidadMerma,
    p_motivo: entrada.motivo,
  });
  if (error) lanzarErrorProduccion(error.message);

  const fila = ((data ?? []) as Record<string, unknown>[])[0] ?? {};
  if (!fila.id) throw new ErrorProduccion('desconocido');
  return {
    id: String(fila.id),
    cantidadConsumida: Number(fila.cantidad_consumida),
    cantidadScrap: Number(fila.cantidad_scrap),
  };
}

export function mensajeErrorSesion(error: unknown): string {
  // C31/A10: ningún error llega al operador como texto genérico. Si vino de
  // otra capa, se muestra su causa exacta y el paso siguiente.
  if (!(error instanceof ErrorProduccion)) {
    const causa = error instanceof Error ? error.message.trim() : '';
    if (!causa) {
      return 'La operación no se pudo completar. Vuelve a cargar la ficha y reintenta; si continúa, pide a administración que revise la orden.';
    }
    const probableCodigo = /^[a-z][a-z0-9_]*$/u.test(causa) ? causa : null;
    if (probableCodigo) return describirErrorProduccion(probableCodigo).mensaje;
    return `${causa}. Revisa el dato indicado y vuelve a intentarlo.`;
  }

  switch (error.codigo) {
    case 'jornada_cerrada':
      return detalleDelMensaje(error) ?? 'Sin disponibilidad: ese día no tiene jornada laboral; elige de lunes a sábado.';
    case 'recurso_sin_equipos':
      return detalleDelMensaje(error) ?? 'Sin disponibilidad: no hay equipos activos del grupo que pide el proceso.';
    case 'recurso_sin_capacidad':
      return detalleDelMensaje(error) ?? 'Sin disponibilidad: el equipo no tiene capacidad configurada para esa fecha; elige otro día.';
    case 'recurso_capacidad_excedida':
    case 'sin_recurso_disponible':
      return detalleDelMensaje(error) ?? 'Sin disponibilidad suficiente: el proceso no cabe en el tiempo libre del equipo ese día.';
    case 'cierre_sesion_invalido':
      return 'El cierre requiere datos válidos; el consumo de material solo es obligatorio cuando la ruta lo exige';
    case 'cierre_consumo_invalido':
      return 'El consumo capturado no es válido para este cierre. Revisa el material, la cantidad usada y la merma, y vuelve a registrarlos.';
    case 'proceso_corrida_no_corresponde':
      return 'La corrida elegida no corresponde a este proceso. Abre de nuevo la ficha y selecciona la corrida correcta.';
    case 'material_no_corresponde_corrida':
      return 'El material elegido no pertenece a la corrida de esta orden. Selecciona el material del ítem.';
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
    case 'consumo_piezas_invalido':
      return 'Indica cuántas piezas usaste y cuántas tuvieron merma, con su motivo.';
    case 'proceso_sin_piezas_previas':
      return 'Este proceso no tiene un paso anterior del que consumir piezas.';
    case 'consumo_piezas_menor_produccion':
      return 'Las piezas usadas del proceso anterior deben ser al menos las producidas en esta sesión. Revisa «Usado» o la merma y vuelve a cerrar.';
    case 'meta_proceso_no_corresponde':
      return 'El proceso elegido no pertenece a esta partida';
    case 'cantidad_excede_meta_proceso':
      return 'La cantidad supera lo pendiente de esa meta de proceso';
    case 'sesion_no_activa':
      return 'La sesión ya fue actualizada o no está disponible';
    case 'programacion_conflicto':
      return 'La pausa cambió en otra pantalla; actualiza el tablero';
    case 'recurso_ocupado':
      return detalleDelMensaje(error)
        ?? 'Equipo ocupado por otro proceso en curso. No puedes cancelar el trabajo de otro operador desde aquí; espera a que lo cierren o pausen, o elige otra fecha.';
    case 'capacidad_no_disponible':
      return detalleDelMensaje(error) ?? 'La capacidad del recurso ya no permite reanudar';
    case 'programacion_no_bloqueada':
    case 'sesion_pausada_inexistente':
    case 'orden_no_reanudable':
      return 'La orden ya no está pausada o no puede reanudarse';
    case 'sesion_no_pausada':
      return 'La sesión ya no está pausada; actualiza el tablero';
    case 'sesion_partida_inconsistente':
      return 'La sesión no corresponde a una partida de esta orden. Actualiza el tablero y vuelve a abrir el proceso.';
    case 'programacion_inexistente':
      return 'La programación de esta pausa ya no existe; actualiza el tablero y vuelve a reclamar el proceso.';
    case 'recurso_inexistente':
      return 'El recurso de esta sesión ya no existe. Pide a administración que lo revise y actualiza el tablero.';
    case 'pausa_ya_superada':
      return 'Esa pausa ya fue retomada por una sesión posterior; actualiza el tablero';
    case 'sin_sesion_liberable':
      return 'La pausa ya no cumple las condiciones para liberar la máquina (motivo, 60 minutos o sesión vigente). Actualiza el panel.';
    case 'recurso_ya_reclamado':
      return 'Otra persona ya reclamó esta máquina; actualiza el panel.';
    case 'conflicto_idempotencia':
      return 'Esa petición ya se usó para liberar otra máquina o sesión. Recarga la página y vuelve a pulsar Reclamar desde el panel.';
    case 'sin_permiso_reabrir_operacion':
      return 'No tienes permiso para reabrir operaciones bloqueadas. Pide a Planeación que lo haga.';
    case 'operacion_no_bloqueada':
      return 'La operación ya no está bloqueada; actualiza la vista antes de volver a intentarlo.';
    case 'sesion_pendiente':
      return 'Hay una sesión activa o pausada en esta operación. Ciérrala antes de reabrir.';
    case 'sin_permiso_reasignar':
      return 'No tienes permiso para reasignar responsables de partida.';
    case 'partida_con_sesion_activa':
      return 'La partida tiene una sesión en curso o pausada; ciérrala antes de reasignar.';
    case 'operador_asignado_distinto':
      return 'Esa petición ya reasignó la partida a otro operador. Recarga la página y vuelve a intentarlo.';
    case 'partida_inexistente':
      return 'La partida ya no existe; actualiza la orden antes de reasignar.';
    case 'motivo_no_liberable':
      return 'El motivo de la pausa no libera la máquina; no se puede reclamar desde aquí.';
    case 'pausa_reciente':
      return 'La pausa todavía no cumple 60 minutos; podrás reclamarla más tarde.';
    case 'programacion_no_liberable':
      return 'La operación ya está en producción o completada; no se puede reclamar esta pausa.';
    case 'sin_permiso_reclamar_recurso':
      return 'No tienes permiso para reclamar recursos.';
    case 'reclamacion_invalida':
      return 'Faltan datos para reclamar el recurso; actualiza el panel.';
    case 'cierre_pausa_invalido':
      return 'No se pudo cerrar la pausa; actualiza el tablero';
    case 'orden_no_terminada':
      return 'Solo se puede cerrar una pausa huérfana cuando la orden ya terminó.';
    case 'pausa_sin_corte':
      return 'La pausa no tiene una hora de corte registrada; actualiza el tablero.';
    case 'pausa_huerfana_invalida':
      return 'Indica horas reales solo cuando decidas conservar el tiempo.';
    case 'motivo_cierre_invalido':
      return 'El motivo del cierre no puede superar 500 caracteres.';
    case 'sin_permiso_cierre_pausa':
      return 'No tienes permiso para cerrar pausas administrativas.';
    case 'sesion_orden_inconsistente':
      return 'La sesión no corresponde a una orden válida; actualiza el tablero.';
    case 'hora_fin_invalida':
    case 'fecha_fin_futura':
    case 'fecha_fin_anterior_inicio':
      return describirErrorProduccion(error.codigo).mensaje;
    case 'actualizacion_avance_invalida':
      return 'Revisa las piezas y las horas declaradas para actualizar el avance';
    case 'sesion_no_pendiente_avance':
      return 'Esta pausa ya no está pendiente de actualizar avance; actualiza el tablero';
    case 'horas_a_restar_exceden_sesion':
    case 'horas_reales_exceden_sesion':
      return 'El tiempo real de proceso no puede ser mayor al tiempo de la sesión pausada';
    case 'sesion_antigua_pendiente':
      return 'Primero actualiza la sesión pausada más antigua';
    case 'sesiones_pausadas_excedidas':
      return 'Este proceso ya acumuló 3 pausas sin avance. Actualiza o marca como inválidas las sesiones anteriores antes de continuar';
    case 'sin_permiso_actualizar_avance':
      return 'No tienes permiso para actualizar el avance de esta sesión';
    case 'verificacion_inicio_incompleta':
      return 'Completa el checklist de eventos críticos para iniciar';
    case 'nota_pausa_requerida':
      return 'Este motivo de pausa exige una nota';
    case 'primera_pieza_pendiente':
      return 'Falta liberar la primera pieza antes de declarar producción';
    case 'horas_extra_sin_autorizacion':
      return 'La jornada son 8 h netas acumuladas del día (la comida de 12 a 13 no se cuenta). '
        + 'Al cerrar, el tiempo de esta sesión más lo ya trabajado hoy supera ese límite. '
        + 'Si el proceso terminó antes, corrige la hora real de conclusión. Si trabajaste de más, '
        + 'justifica el exceso o pide autorización a un responsable.';
    case 'horas_extra_no_requeridas':
      return 'La sesión no excede la jornada del turno, así que no requiere horas extra.';
    case 'justificacion_horas_extra_invalida':
      return 'Escribe una justificación de al menos 10 caracteres para las horas extra.';
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
    case 'consumo_material_requerido':
      return 'Este proceso requiere registrar el consumo de material propio antes de finalizar.';
    case 'motivo_consumo_requerido':
      return 'Indica el motivo del consumo de material.';
    case 'setup_invalido':
      return 'Los minutos de setup deben ser un número válido.';
    case 'minutos_setup_exceden_sesion':
      return 'Los minutos de setup no pueden superar el tiempo transcurrido de la sesión.';
    case 'sin_permiso_setup':
      return 'Solo el operador de la sesión puede identificar su setup.';
    case 'inspeccion_cierre_duplicada':
      return 'Este lote ya tiene una inspección de cierre registrada; usa la revalidación para corregir.';
    case 'disposicion_calidad_incompleta':
      return 'La disposición debe cuadrar con las piezas producidas: conformes + recuperables + scrap.';
    case 'disposicion_excede_conforme':
      return 'No hay piezas conformes suficientes para separar las recuperables o el scrap indicados.';
    case 'revalidacion_excede_pendiente':
      return 'La revalidación supera las piezas pendientes de recuperar.';
    case 'revalidacion_no_aprobada':
      return 'Solo una revalidación aprobada puede liberar piezas conformes.';
    case 'revalidacion_sin_cantidad':
      return 'Indica las piezas recuperadas o el scrap de la revalidación.';
    case 'partida_requerida':
      return 'Selecciona el ítem que se va a revalidar.';
    case 'material_retrabajo_inexistente':
      return 'El material del retrabajo no existe en el catálogo.';
    case 'costo_retrabajo_no_configurado':
      return 'El material del retrabajo no tiene costo confirmado.';
    case 'resultado_retrabajo_invalido':
      return 'El resultado del retrabajo debe ser pendiente, recuperado o scrap.';
    case 'solicitud_retrabajo_conflicto':
      return 'Ese intento de retrabajo ya se usó con otros datos; actualiza e inténtalo de nuevo.';
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
    default: {
      // C24/C31-A11: regla transversal: nunca un error genérico ni técnico.
      const crudo = error.message?.trim() ?? '';
      if (/^[a-z][a-z0-9_]*$/u.test(crudo)) return describirErrorProduccion(crudo).mensaje;
      return detalleDelMensaje(error)
        ?? describirErrorProduccion(error.codigo).mensaje;
    }
  }
}

/**
 * C24: los RPC lanzan `codigo: detalle legible`. El detalle manda sobre el
 * texto fijo para que el operador sepa qué corregir y no quede sin salida.
 */
function detalleDelMensaje(error: ErrorProduccion): string | null {
  const mensaje = error.message ?? '';
  const separador = mensaje.indexOf(':');
  if (separador < 0) return null;
  const detalle = mensaje.slice(separador + 1).trim();
  if (detalle.length === 0 || detalle === error.codigo) return null;
  return detalle.charAt(0).toUpperCase() + detalle.slice(1);
}

export { filaASesionTrabajo };
