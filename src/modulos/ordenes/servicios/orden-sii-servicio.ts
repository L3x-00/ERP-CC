import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Json } from '@/compartido/tipos/supabase';
import type {
  OrdenSiiCerrada,
  OrdenSiiCreada,
  OrdenSiiEstadoActualizado,
} from '@/modulos/ordenes/tipos/orden-sii';
import type {
  AjustarOrdenPostAceptacionInput,
  CrearOrdenInternaInput,
} from '@/modulos/ordenes/validaciones/orden-sii';

export type ClienteOrdenesSii = SupabaseClient<Database>;

/** Códigos estables de las RPC de B5; el detalle crudo no llega al cliente. */
const CODIGOS_CONOCIDOS = [
  'sin_permiso_orden_interna',
  'sin_permiso_orden',
  'revision_no_aceptada',
  'revision_inexistente',
  'propuesta_inexistente',
  'rfq_inexistente',
  'cliente_no_activo',
  'credito_limite_excedido',
  'tipo_cambio_usd_requerido',
  'propuesta_sin_items_fabricables',
  'orden_interna_datos_invalidos',
  'autorizacion_requerida',
  'motivo_autorizacion_requerido',
  'autorizador_invalido',
  'items_requeridos',
  'item_invalido',
  'fecha_compromiso_requerida',
  'prioridad_invalida',
  'orden_inexistente',
  'orden_desactualizada',
  'transicion_invalida',
  'orden_ya_cerrada',
  'orden_no_lista_para_liberar',
  'orden_no_entregada_completa',
  'orden_sin_partidas',
  'orden_en_produccion',
  'motivo_requerido',
  'cambios_requeridos',
  'campo_invalido',
  'partidas_invalidas',
  'partida_invalida',
  'notas_invalidas',
] as const;

export class ErrorOrdenSii extends Error {
  constructor(
    public readonly codigo: string,
    mensaje?: string,
  ) {
    super(mensaje ?? codigo);
    this.name = 'ErrorOrdenSii';
  }
}

/** Extrae el primer código de negocio presente en el mensaje de Postgres. */
export function codigoErrorOrdenSii(mensaje: string): string {
  return CODIGOS_CONOCIDOS.find((codigo) => mensaje.includes(codigo)) ?? 'desconocido';
}

function lanzarDesdeRpc(error: { message: string } | null): never {
  throw new ErrorOrdenSii(codigoErrorOrdenSii(error?.message ?? ''), error?.message);
}

export async function crearOrdenDesdeRevisionServicio(
  cliente: ClienteOrdenesSii,
  entrada: { revisionId: string; actorId: string; correlationId: string },
): Promise<OrdenSiiCreada> {
  // C4.1/DC-09: la Orden se crea a través de la solicitud durable. Si un gate
  // falla, la solicitud queda «Orden pendiente» (BLOCKED) con la causa y la
  // aceptación se conserva; reintentar converge en una sola Orden.
  const { data, error } = await cliente.rpc('procesar_solicitud_orden', {
    p_revision_id: entrada.revisionId,
    p_actor_id: entrada.actorId,
    p_correlation_id: entrada.correlationId,
  });
  if (error || !data || typeof data !== 'object' || Array.isArray(data)) lanzarDesdeRpc(error);
  const resultado = data as Record<string, unknown>;
  if (resultado.estado !== 'CREATED' || typeof resultado.ordenId !== 'string') {
    lanzarDesdeRpc({ message: String(resultado.causa ?? 'solicitud_orden_bloqueada') });
  }
  return {
    id: resultado.ordenId,
    folio: String(resultado.folio ?? ''),
    folioSii: String(resultado.folioSii ?? ''),
    yaExistia: resultado.yaExistia === true,
  };
}

function datosInternosAJson(entrada: CrearOrdenInternaInput): Json {
  return {
    cliente_id: entrada.clienteId,
    fecha_compromiso: entrada.fechaCompromiso,
    prioridad: entrada.prioridad,
    descripcion: entrada.descripcion ?? null,
    notas: entrada.notas ?? null,
    items: entrada.items.map((item) => ({
      codigo_item: item.codigoItem ?? null,
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      material: item.material ?? null,
      espesor: item.espesor ?? null,
      procesos: item.procesos ?? [],
      tiempo_estimado_minutos: item.tiempoEstimadoMinutos,
    })),
  };
}

export async function crearOrdenInternaServicio(
  cliente: ClienteOrdenesSii,
  entrada: CrearOrdenInternaInput & { actorId: string; correlationId: string },
): Promise<OrdenSiiCreada> {
  const autorizacion: Json = {
    motivo: entrada.motivoAutorizacion,
    autorizado_por: entrada.autorizadoPor ?? entrada.actorId,
  };
  const { data, error } = await cliente.rpc('crear_orden_interna', {
    p_datos: datosInternosAJson(entrada),
    p_autorizacion: autorizacion,
    p_actor_id: entrada.actorId,
    p_correlation_id: entrada.correlationId,
  });
  const fila = data?.[0];
  if (error || !fila) lanzarDesdeRpc(error);
  return { id: fila.id, folio: fila.folio, folioSii: fila.folio_sii, yaExistia: fila.ya_existia };
}

export async function liberarOrdenServicio(
  cliente: ClienteOrdenesSii,
  entrada: { ordenId: string; actualizadoEn: string; actorId: string; correlationId: string },
): Promise<OrdenSiiEstadoActualizado> {
  const { data, error } = await cliente.rpc('liberar_orden', {
    p_orden_id: entrada.ordenId,
    p_actualizado_en: entrada.actualizadoEn,
    p_actor_id: entrada.actorId,
    p_correlation_id: entrada.correlationId,
  });
  const fila = data?.[0];
  if (error || !fila) lanzarDesdeRpc(error);
  return { id: fila.id, estadoSii: fila.estado_sii as OrdenSiiEstadoActualizado['estadoSii'], actualizadoEn: fila.actualizado_en };
}

export async function cerrarOrdenAdministrativaServicio(
  cliente: ClienteOrdenesSii,
  entrada: { ordenId: string; actualizadoEn: string; actorId: string; correlationId: string },
): Promise<OrdenSiiCerrada> {
  const { data, error } = await cliente.rpc('cerrar_orden_administrativa', {
    p_orden_id: entrada.ordenId,
    p_actualizado_en: entrada.actualizadoEn,
    p_actor_id: entrada.actorId,
    p_correlation_id: entrada.correlationId,
  });
  const fila = data?.[0];
  if (error || !fila) lanzarDesdeRpc(error);
  return {
    id: fila.id,
    estadoSii: fila.estado_sii as OrdenSiiCerrada['estadoSii'],
    cerradaAdminEn: fila.cerrada_admin_en,
  };
}

function cambiosAJson(cambios: AjustarOrdenPostAceptacionInput['cambios']): Json {
  return {
    fecha_compromiso: cambios.fechaCompromiso ?? null,
    prioridad: cambios.prioridad ?? null,
    notas: cambios.notas ?? null,
    partidas: (cambios.partidas ?? []).map((partida) => ({
      partida_id: partida.partidaId,
      cantidad_solicitada: partida.cantidadSolicitada ?? null,
      descripcion: partida.descripcion ?? null,
    })),
  };
}

export async function ajustarOrdenPostAceptacionServicio(
  cliente: ClienteOrdenesSii,
  entrada: AjustarOrdenPostAceptacionInput & { actorId: string; correlationId: string },
): Promise<OrdenSiiEstadoActualizado> {
  const { data, error } = await cliente.rpc('ajustar_orden_post_aceptacion', {
    p_orden_id: entrada.ordenId,
    p_cambios: cambiosAJson(entrada.cambios),
    p_motivo: entrada.motivo,
    p_actualizado_en: entrada.actualizadoEn,
    p_actor_id: entrada.actorId,
    p_correlation_id: entrada.correlationId,
  });
  const fila = data?.[0];
  if (error || !fila) lanzarDesdeRpc(error);
  return { id: fila.id, estadoSii: fila.estado_sii as OrdenSiiEstadoActualizado['estadoSii'], actualizadoEn: fila.actualizado_en };
}
