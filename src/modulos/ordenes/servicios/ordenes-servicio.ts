import type { SupabaseClient } from '@supabase/supabase-js';
import type { Json, Database } from '@/compartido/tipos/supabase';
import {
  ESTADOS_ORDEN_PRODUCCION,
  filaAOrden,
  filaAPartida,
  filaARegistroConsumoMaterial,
  filaARegistroTiempo,
  type EstadoOrden,
  type Orden,
  type Partida,
  type RegistroConsumoMaterial,
  type RegistroTiempo,
} from '@/modulos/ordenes/tipos/ordenes';
import type {
  CambiarEstadoOrdenInput,
  CrearOrdenManualInput,
  RegistrarConsumoMaterialInput,
  RegistrarTiempoOperadorInput,
} from '@/modulos/ordenes/validaciones/ordenes';

export type CodigoErrorOrden =
  | 'cotizacion_duplicada'
  | 'cotizacion_sin_lineas'
  | 'orden_inexistente'
  | 'estado_conflicto'
  | 'transicion_no_permitida'
  | 'motivo_cancelacion_requerido'
  | 'stock_insuficiente'
  | 'partida_inexistente'
  | 'material_inexistente'
  | 'material_no_corresponde_partida'
  | 'cantidad_consumo_invalida'
  | 'orden_no_en_proceso'
  | 'operador_no_activo'
  | 'accion_tiempo_invalida'
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

export type OrdenConPartidas = {
  orden: Orden;
  partidas: Partida[];
};

export type ConsumoMaterialRegistrado = {
  id: string;
  costoUnitarioMomento: number;
  cantidadTotal: number;
  movimientoInventarioId: string;
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
  if (mensaje.includes('stock_insuficiente')) return 'stock_insuficiente';
  if (mensaje.includes('partida_inexistente')) return 'partida_inexistente';
  if (mensaje.includes('material_inexistente')) return 'material_inexistente';
  if (mensaje.includes('material_no_corresponde_partida')) {
    return 'material_no_corresponde_partida';
  }
  if (mensaje.includes('cantidad_consumo_invalida')) {
    return 'cantidad_consumo_invalida';
  }
  if (mensaje.includes('orden_no_en_proceso')) return 'orden_no_en_proceso';
  if (mensaje.includes('operador_no_activo')) return 'operador_no_activo';
  if (mensaje.includes('accion_tiempo_invalida')) return 'accion_tiempo_invalida';
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

/** Carga una OP y sus partidas; la RLS define qué registros puede consultar el usuario. */
export async function obtenerOrdenConPartidasServicio(
  cliente: SupabaseClient<Database>,
  ordenId: string,
): Promise<OrdenConPartidas | null> {
  const { data: filaOrden, error: errorOrden } = await cliente
    .from('ordenes_produccion')
    .select('*')
    .eq('id', ordenId)
    .maybeSingle();

  if (errorOrden) {
    throw new ErrorOrden('desconocido', errorOrden.message);
  }
  if (!filaOrden) return null;

  const { data: filasPartidas, error: errorPartidas } = await cliente
    .from('partidas_orden_produccion')
    .select('*')
    .eq('orden_id', ordenId)
    .order('creado_en', { ascending: true });

  if (errorPartidas) {
    throw new ErrorOrden('desconocido', errorPartidas.message);
  }

  return {
    orden: filaAOrden(filaOrden),
    partidas: (filasPartidas ?? []).map(filaAPartida),
  };
}

/** Lista el historial de consumo de una partida para cálculo de merma y costo real. */
export async function obtenerConsumosPartidaServicio(
  cliente: SupabaseClient<Database>,
  partidaId: string,
): Promise<RegistroConsumoMaterial[]> {
  const { data, error } = await cliente
    .from('registros_consumo_material')
    .select('*')
    .eq('partida_id', partidaId)
    .order('creado_en', { ascending: true });

  if (error) {
    throw new ErrorOrden('desconocido', error.message);
  }
  return (data ?? []).map(filaARegistroConsumoMaterial);
}

/**
 * Registra usado y scrap mediante la RPC que bloquea inventario, crea kardex y
 * persiste el costo CPP histórico en una única transacción PostgreSQL.
 */
export async function registrarConsumoMaterialServicio(
  admin: SupabaseClient<Database>,
  entrada: RegistrarConsumoMaterialInput,
): Promise<ConsumoMaterialRegistrado> {
  const { data, error } = await admin.rpc('registrar_consumo_material_op', {
    p_partida_id: entrada.partidaId,
    p_material_id: entrada.materialId,
    p_cantidad_usada: entrada.cantidadUsada,
    p_cantidad_scrap: entrada.cantidadScrap,
  });

  if (error) lanzarErrorOrden(error.message);
  const fila = data?.[0];
  if (!fila?.id || !fila.movimiento_inventario_id) {
    throw new ErrorOrden('desconocido');
  }

  return {
    id: fila.id,
    costoUnitarioMomento: Number(fila.costo_unitario_momento),
    cantidadTotal: Number(fila.cantidad_total),
    movimientoInventarioId: fila.movimiento_inventario_id,
  };
}

/**
 * Persiste una marca de tiempo mediante la RPC que bloquea la OP y confirma
 * que esté en proceso. Postgres fija la fecha; nunca se acepta un reloj del
 * navegador para la evidencia de taller.
 */
export async function registrarTiempoOperadorServicio(
  admin: SupabaseClient<Database>,
  entrada: RegistrarTiempoOperadorInput,
): Promise<RegistroTiempo> {
  const { data, error } = await admin.rpc('registrar_tiempo_operador_op', {
    p_partida_id: entrada.partidaId,
    p_operador_id: entrada.operadorId,
    p_accion: entrada.accion,
    ...(entrada.notas ? { p_notas: entrada.notas } : {}),
  });

  if (error) {
    lanzarErrorOrden(error.message);
  }
  const fila = data?.[0];
  if (!fila) throw new ErrorOrden('desconocido');

  return filaARegistroTiempo(fila);
}

export function mensajeErrorOrden(
  error: unknown,
  accion: 'crear' | 'actualizar' | 'aprobar' | 'consumir',
): string {
  const mensajeGenerico =
    accion === 'crear'
      ? 'No se pudo crear la orden'
      : accion === 'aprobar'
        ? 'No se pudo aprobar la oportunidad'
        : accion === 'consumir'
          ? 'No se pudo registrar el consumo de material'
          : 'No se pudo actualizar la orden';

  if (!(error instanceof ErrorOrden)) {
    return mensajeGenerico;
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
    case 'stock_insuficiente':
      return 'Stock insuficiente para registrar el consumo';
    case 'material_no_corresponde_partida':
      return 'El material no corresponde a la partida seleccionada';
    case 'partida_inexistente':
    case 'material_inexistente':
      return 'La partida o el material ya no están disponibles';
    case 'cantidad_consumo_invalida':
      return 'La cantidad de consumo no es válida';
    default:
      return mensajeGenerico;
  }
}
