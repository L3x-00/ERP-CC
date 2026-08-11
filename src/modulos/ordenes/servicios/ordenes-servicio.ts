import type { SupabaseClient } from '@supabase/supabase-js';
import type { Json, Database } from '@/compartido/tipos/supabase';
import {
  ESTADOS_ORDEN_PRODUCCION,
  type EstadoOrden,
} from '@/modulos/ordenes/tipos/ordenes';
import type {
  CambiarEstadoOrdenInput,
  CrearOrdenManualInput,
} from '@/modulos/ordenes/validaciones/ordenes';

export type CodigoErrorOrden =
  | 'cotizacion_duplicada'
  | 'cotizacion_sin_lineas'
  | 'orden_inexistente'
  | 'estado_conflicto'
  | 'transicion_no_permitida'
  | 'motivo_cancelacion_requerido'
  | 'desconocido';

/** Error de negocio estable; el detalle crudo de Postgres no llega al cliente. */
export class ErrorOrden extends Error {
  constructor(
    public readonly codigo: CodigoErrorOrden,
    mensaje?: string,
  ) {
    super(mensaje ?? codigo);
    this.name = 'ErrorOrden';
  }
}

export type OrdenCreada = {
  id: string;
  folio: string;
};

export type ResultadoOportunidadAprobada = OrdenCreada & {
  yaExistia: boolean;
};

export type OrdenConEstadoActualizado = {
  id: string;
  estado: EstadoOrden;
  fechaInicio: string | null;
  fechaFin: string | null;
};

function partidasAJson(partidas: CrearOrdenManualInput['partidas']): Json {
  return partidas.map((partida) => ({
    codigo_pieza: partida.codigoPieza,
    descripcion: partida.descripcion ?? null,
    cantidad_solicitada: partida.cantidadSolicitada,
    unidad_medida: partida.unidadMedida,
    material_id: partida.materialId ?? null,
    tiempo_estimado_minutos: partida.tiempoEstimadoMinutos,
    maquina_asignada: partida.maquinaAsignada ?? null,
  }));
}

function codigoDesdeMensaje(mensaje: string): CodigoErrorOrden {
  if (mensaje.includes('idx_ordenes_produccion_cotizacion_unica')) {
    return 'cotizacion_duplicada';
  }
  if (mensaje.includes('cotizacion_sin_lineas')) return 'cotizacion_sin_lineas';
  if (mensaje.includes('orden_inexistente')) return 'orden_inexistente';
  if (mensaje.includes('estado_conflicto')) return 'estado_conflicto';
  if (mensaje.includes('transicion_no_permitida')) return 'transicion_no_permitida';
  if (mensaje.includes('motivo_cancelacion_requerido')) {
    return 'motivo_cancelacion_requerido';
  }
  return 'desconocido';
}

function lanzarErrorOrden(mensaje: string | undefined): never {
  throw new ErrorOrden(codigoDesdeMensaje(mensaje ?? ''), mensaje);
}

function validarResultadoCreacion(fila: OrdenCreada | null): OrdenCreada {
  if (!fila?.id || !fila.folio) {
    throw new ErrorOrden('desconocido');
  }
  return fila;
}

function estadoDeBaseDeDatos(estado: string): EstadoOrden {
  if (!ESTADOS_ORDEN_PRODUCCION.includes(estado as EstadoOrden)) {
    throw new ErrorOrden('desconocido', 'Estado de orden inválido devuelto por la base de datos');
  }
  return estado as EstadoOrden;
}

/**
 * Crea cabecera y partidas mediante una sola RPC con service_role. El folio y
 * la transacción residen en Postgres, nunca en el proceso de Next.js.
 */
export async function crearOrdenManualServicio(
  admin: SupabaseClient<Database>,
  entrada: CrearOrdenManualInput,
): Promise<OrdenCreada> {
  const argumentos: Database['public']['Functions']['crear_orden_manual']['Args'] = {
    p_cliente_id: entrada.clienteId,
    p_fecha_compromiso: entrada.fechaCompromiso,
    p_prioridad: entrada.prioridad,
    p_partidas: partidasAJson(entrada.partidas),
  };
  const { data, error } = await admin.rpc('crear_orden_manual', argumentos);

  if (error) lanzarErrorOrden(error.message);
  return validarResultadoCreacion(data?.[0] ?? null);
}

/** Aprueba Pipeline y crea su OP sin exponer una ventana entre ambas escrituras. */
export async function aprobarOportunidadYCrearOrdenServicio(
  admin: SupabaseClient<Database>,
  entrada: {
    pipelineId: string;
    clienteId: string;
    fechaCompromiso: string;
  },
): Promise<ResultadoOportunidadAprobada> {
  const { data, error } = await admin.rpc('aprobar_oportunidad_y_crear_orden', {
    p_pipeline_id: entrada.pipelineId,
    p_cliente_id: entrada.clienteId,
    p_fecha_compromiso: entrada.fechaCompromiso,
  });

  if (error) lanzarErrorOrden(error.message);
  const fila = data?.[0];
  const creada = validarResultadoCreacion(fila ?? null);
  return { id: creada.id, folio: creada.folio, yaExistia: fila?.ya_existia ?? false };
}

/** Ejecuta compare-and-set del estado para evitar sobrescribir una pantalla obsoleta. */
export async function cambiarEstadoOrdenServicio(
  admin: SupabaseClient<Database>,
  entrada: CambiarEstadoOrdenInput,
): Promise<OrdenConEstadoActualizado> {
  const { data, error } = await admin.rpc('cambiar_estado_orden', {
    p_orden_id: entrada.ordenId,
    p_estado_actual: entrada.estadoActual,
    p_estado_nuevo: entrada.estado,
    ...(entrada.motivoCancelacion
      ? { p_motivo_cancelacion: entrada.motivoCancelacion }
      : {}),
  });

  if (error) lanzarErrorOrden(error.message);
  const fila = data?.[0];
  if (!fila?.id) {
    throw new ErrorOrden('desconocido');
  }

  return {
    id: fila.id,
    estado: estadoDeBaseDeDatos(fila.estado),
    fechaInicio: fila.fecha_inicio,
    fechaFin: fila.fecha_fin,
  };
}

export function mensajeErrorOrden(error: unknown, accion: 'crear' | 'actualizar' | 'aprobar'): string {
  if (!(error instanceof ErrorOrden)) {
    return accion === 'crear'
      ? 'No se pudo crear la orden'
      : accion === 'aprobar'
        ? 'No se pudo aprobar la oportunidad'
        : 'No se pudo actualizar la orden';
  }

  switch (error.codigo) {
    case 'cotizacion_sin_lineas':
      return 'La cotización debe tener al menos una partida para generar la orden';
    case 'orden_inexistente':
      return 'La orden no existe o ya no está disponible';
    case 'estado_conflicto':
      return 'La orden fue actualizada por otro usuario. Recarga e inténtalo de nuevo';
    case 'transicion_no_permitida':
      return 'La transición de estado no está permitida';
    case 'motivo_cancelacion_requerido':
      return 'El motivo de cancelación es obligatorio';
    case 'cotizacion_duplicada':
      return 'La cotización ya tiene una orden de producción';
    default:
      return accion === 'crear'
        ? 'No se pudo crear la orden'
        : accion === 'aprobar'
          ? 'No se pudo aprobar la oportunidad'
          : 'No se pudo actualizar la orden';
  }
}
