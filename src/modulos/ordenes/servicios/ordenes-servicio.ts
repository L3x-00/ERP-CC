import type { SupabaseClient } from '@supabase/supabase-js';
import type { Json, Database } from '@/compartido/tipos/supabase';
import {
  ESTADOS_ORDEN_PRODUCCION,
  filaAOrden,
  filaAPartida,
  filaARegistroConsumoMaterial,
  filaARegistroTiempo,
  type EstadoOrden,
  type FilaOrden,
  type Orden,
  type Partida,
  type RegistroConsumoMaterial,
  type RegistroTiempo,
} from '@/modulos/ordenes/tipos/ordenes';
import type {
  ActualizarOrdenBorradorInput,
  ConfigurarMetasProcesoInput,
  CambiarEstadoOrdenInput,
  CrearOrdenHistoricaInput,
  CrearOrdenManualInput,
  RepetirOrdenInput,
  AsignarOperadorPartidaInput,
  RegistrarConsumoMaterialInput,
  RegistrarAvancePartidaInput,
  RegistrarTiempoOperadorInput,
} from '@/modulos/ordenes/validaciones/ordenes';

export type CodigoErrorOrden =
  | 'cotizacion_duplicada'
  | 'cotizacion_sin_lineas'
  | 'credito_limite_excedido'
  | 'cliente_no_corresponde_oportunidad'
  | 'cliente_no_activo'
  | 'sobregiro_requiere_admin_activo'
  | 'orden_inexistente'
  | 'estado_conflicto'
  | 'transicion_no_permitida'
  | 'motivo_cancelacion_requerido'
  | 'orden_con_cobranza_registrada'
  | 'orden_con_partidas_pendientes'
  | 'stock_insuficiente'
  | 'partida_inexistente'
  | 'material_inexistente'
  | 'material_no_corresponde_partida'
  | 'cantidad_consumo_invalida'
  | 'cantidad_avance_invalida'
  | 'cantidad_producida_excede_solicitada'
  | 'orden_no_editable'
  | 'orden_desactualizada'
  | 'metas_proceso_invalidas'
  | 'sin_permiso_configurar_procesos'
  | 'partida_con_historial'
  | 'orden_no_en_proceso'
  | 'orden_no_asignable'
  | 'operador_no_activo'
  | 'operador_no_asignado_partida'
  | 'accion_tiempo_invalida'
  | 'orden_historica_invalida'
  | 'sin_permiso_orden_historica'
  | 'id_historico_duplicado'
  | 'orden_no_repetible'
  | 'sin_permiso_repetir_orden'
  | 'orden_sin_partidas'
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

/** ORD-06: el alta heredada también devuelve la AR no cobrable creada. */
export type OrdenHistoricaCreada = OrdenCreada & {
  cuentaId: string;
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

export type AvancePartidaRegistrado = {
  partidaId: string;
  cantidadProducida: number;
  cantidadScrap: number;
  actualizadoEn: string;
};

export type PartidaConOperadorAsignado = {
  partidaId: string;
  operadorAsignadoId: string;
  actualizadoEn: string;
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

/** ORD-06: la partida heredada admite área, procesos y proveedor externo. */
function partidasHistoricasAJson(partidas: CrearOrdenHistoricaInput['partidas']): Json {
  return partidas.map((partida) => ({
    codigo_pieza: partida.codigoPieza,
    descripcion: partida.descripcion ?? null,
    cantidad_solicitada: partida.cantidadSolicitada,
    unidad_medida: partida.unidadMedida,
    material_id: partida.materialId ?? null,
    tiempo_estimado_minutos: partida.tiempoEstimadoMinutos,
    maquina_asignada: partida.maquinaAsignada ?? null,
    area_trabajo_codigo: partida.areaTrabajoCodigo ?? null,
    procesos: partida.procesos ?? [],
    es_externo: partida.esExterno ?? false,
    proveedor_externo: partida.proveedorExterno ?? null,
  }));
}

function codigoDesdeMensaje(mensaje: string): CodigoErrorOrden {
  if (mensaje.includes('idx_ordenes_produccion_cotizacion_unica')) {
    return 'cotizacion_duplicada';
  }
  if (mensaje.includes('cotizacion_sin_lineas')) return 'cotizacion_sin_lineas';
  if (mensaje.includes('credito_limite_excedido')) return 'credito_limite_excedido';
  if (mensaje.includes('cliente_no_corresponde_oportunidad')) return 'cliente_no_corresponde_oportunidad';
  if (mensaje.includes('cliente_no_activo')) return 'cliente_no_activo';
  if (mensaje.includes('sobregiro_requiere_admin_activo')) return 'sobregiro_requiere_admin_activo';
  if (mensaje.includes('orden_inexistente')) return 'orden_inexistente';
  if (mensaje.includes('estado_conflicto')) return 'estado_conflicto';
  if (mensaje.includes('transicion_no_permitida')) return 'transicion_no_permitida';
  if (mensaje.includes('motivo_cancelacion_requerido')) {
    return 'motivo_cancelacion_requerido';
  }
  // A02: cancelar una orden cancela su AR; con cobranza registrada se rechaza.
  if (mensaje.includes('orden_con_cobranza_registrada')) {
    return 'orden_con_cobranza_registrada';
  }
  if (mensaje.includes('orden_con_partidas_pendientes')) {
    return 'orden_con_partidas_pendientes';
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
  if (mensaje.includes('cantidad_avance_invalida')) return 'cantidad_avance_invalida';
  if (mensaje.includes('cantidad_producida_excede_solicitada')) {
    return 'cantidad_producida_excede_solicitada';
  }
  if (mensaje.includes('orden_no_editable')) return 'orden_no_editable';
  if (mensaje.includes('orden_desactualizada')) return 'orden_desactualizada';
  if (mensaje.includes('metas_proceso_invalidas')) return 'metas_proceso_invalidas';
  if (mensaje.includes('sin_permiso_configurar_procesos')) return 'sin_permiso_configurar_procesos';
  if (mensaje.includes('partida_con_historial')) return 'partida_con_historial';
  if (mensaje.includes('orden_no_en_proceso')) return 'orden_no_en_proceso';
  if (mensaje.includes('orden_no_asignable')) return 'orden_no_asignable';
  if (mensaje.includes('operador_no_activo')) return 'operador_no_activo';
  if (mensaje.includes('operador_no_asignado_partida')) {
    return 'operador_no_asignado_partida';
  }
  if (mensaje.includes('accion_tiempo_invalida')) return 'accion_tiempo_invalida';
  if (mensaje.includes('orden_historica_invalida')) return 'orden_historica_invalida';
  if (mensaje.includes('sin_permiso_orden_historica')) return 'sin_permiso_orden_historica';
  if (mensaje.includes('id_historico_duplicado')) return 'id_historico_duplicado';
  if (mensaje.includes('orden_no_repetible')) return 'orden_no_repetible';
  if (mensaje.includes('sin_permiso_repetir_orden')) return 'sin_permiso_repetir_orden';
  if (mensaje.includes('orden_sin_partidas')) return 'orden_sin_partidas';
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

/**
 * ORD-06: alta administrativa de un trabajo heredado. PostgreSQL revalida actor,
 * ID previo único, cliente activo y coherencia de montos, y crea en una sola
 * transacción la OP, sus partidas y la AR no cobrable (D-04).
 */
export async function crearOrdenHistoricaServicio(
  admin: SupabaseClient<Database>,
  entrada: CrearOrdenHistoricaInput & { actorId: string },
): Promise<OrdenHistoricaCreada> {
  const { data, error } = await admin.rpc('crear_orden_historica', {
    p_cliente_id: entrada.clienteId,
    p_actor_id: entrada.actorId,
    p_id_historico: entrada.idHistorico,
    p_fecha_trabajo: entrada.fechaTrabajo,
    p_fecha_compromiso: entrada.fechaCompromiso,
    p_condicion_pago: entrada.condicionPago,
    p_referencia_externa: entrada.referenciaExterna ?? '',
    p_monto_sin_iva: entrada.montoSinIva,
    p_monto_iva: entrada.montoIva,
    p_horas_estimadas: entrada.horasEstimadas,
    p_notas: entrada.notas ?? '',
    p_partidas: partidasHistoricasAJson(entrada.partidas),
  });

  if (error) lanzarErrorOrden(error.message);
  const fila = data?.[0];
  const creada = validarResultadoCreacion(fila ?? null);
  if (!fila?.cuenta_id) throw new ErrorOrden('desconocido');
  return { id: creada.id, folio: creada.folio, cuentaId: fila.cuenta_id };
}

/** CLI-08: la repetición puede no tener precio conocido y devuelve cuenta nula. */
export type RepeticionCreada = OrdenCreada & {
  cuentaId: string | null;
};

/**
 * CLI-08: repite un trabajo histórico o completado clonando solo sus datos
 * comerciales/técnicos. PostgreSQL revalida permiso, estado de origen y crea la
 * OP con folio nuevo, partidas en cero y su propia AR borrador.
 */
export async function repetirOrdenServicio(
  admin: SupabaseClient<Database>,
  entrada: RepetirOrdenInput & { actorId: string },
): Promise<RepeticionCreada> {
  const { data, error } = await admin.rpc('repetir_orden_op', {
    p_orden_origen_id: entrada.ordenOrigenId,
    p_actor_id: entrada.actorId,
    p_fecha_compromiso: entrada.fechaCompromiso,
  });
  if (error) lanzarErrorOrden(error.message);
  const fila = data?.[0];
  const creada = validarResultadoCreacion(fila ?? null);
  return { id: creada.id, folio: creada.folio, cuentaId: fila?.cuenta_id ?? null };
}

/** Aprueba Pipeline y crea su OP sin exponer una ventana entre ambas escrituras. */
export async function aprobarOportunidadYCrearOrdenServicio(
  admin: SupabaseClient<Database>,
  entrada: {
    pipelineId: string;
    clienteId: string;
    fechaCompromiso: string;
    actorId: string;
    autorizarSobregiro: boolean;
  },
): Promise<ResultadoOportunidadAprobada> {
  const { data, error } = await admin.rpc('aprobar_oportunidad_y_crear_orden', {
    p_pipeline_id: entrada.pipelineId,
    p_cliente_id: entrada.clienteId,
    p_fecha_compromiso: entrada.fechaCompromiso,
    p_actor_id: entrada.actorId,
    p_autorizar_sobregiro: entrada.autorizarSobregiro,
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

export type OrdenEditada = {
  id: string;
  folio: string;
  estado: EstadoOrden;
  prioridad: string;
  fechaCompromiso: string;
  actualizadoEn: string;
};

/**
 * ORD-05: edita cabecera y partidas de una OP en borrador mediante una sola RPC
 * con `FOR UPDATE` y compare-and-set sobre `actualizado_en`; el token proviene
 * de la lectura que hizo la pantalla y Postgres revalida estado y versión.
 */
export async function actualizarOrdenBorradorServicio(
  admin: SupabaseClient<Database>,
  entrada: ActualizarOrdenBorradorInput,
): Promise<OrdenEditada> {
  const { data, error } = await admin.rpc('actualizar_orden_borrador', {
    p_orden_id: entrada.ordenId,
    p_actualizado_en: entrada.actualizadoEn,
    p_prioridad: entrada.prioridad,
    p_fecha_compromiso: entrada.fechaCompromiso,
    p_partidas: entrada.partidas.map((partida) => ({
      id: partida.id ?? null,
      codigo_pieza: partida.codigoPieza,
      descripcion: partida.descripcion ?? null,
      cantidad_solicitada: partida.cantidadSolicitada,
      unidad_medida: partida.unidadMedida,
      material_id: partida.materialId ?? null,
      tiempo_estimado_minutos: partida.tiempoEstimadoMinutos,
      maquina_asignada: partida.maquinaAsignada ?? null,
    })),
  });

  if (error) lanzarErrorOrden(error.message);
  const fila = data?.[0];
  if (!fila?.id || !fila.folio) {
    throw new ErrorOrden('desconocido');
  }

  return {
    id: fila.id,
    folio: fila.folio,
    estado: estadoDeBaseDeDatos(fila.estado),
    prioridad: fila.prioridad,
    fechaCompromiso: fila.fecha_compromiso,
    actualizadoEn: fila.actualizado_en,
  };
}

/** Cambia metas solo en borrador, con CAS y autorización revalidada en SQL. */
export async function configurarMetasProcesoPartidaServicio(
  admin: SupabaseClient<Database>,
  entrada: ConfigurarMetasProcesoInput & { actorId: string },
): Promise<{ partidaId: string; ordenActualizadoEn: string }> {
  const { data, error } = await admin.rpc('configurar_metas_proceso_partida', {
    p_partida_id: entrada.partidaId,
    p_orden_actualizado_en: entrada.ordenActualizadoEn,
    p_procesos: entrada.procesos.map((proceso) => ({
      nombre: proceso.nombre,
      meta_piezas: proceso.metaPiezas,
    })),
    p_actor_id: entrada.actorId,
  });
  if (error) lanzarErrorOrden(error.message);
  const fila = data?.[0];
  if (!fila?.partida_id || !fila.orden_actualizado_en) throw new ErrorOrden('desconocido');
  return { partidaId: fila.partida_id, ordenActualizadoEn: fila.orden_actualizado_en };
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

/**
 * Carga las OP y todas sus partidas en dos consultas, sin N+1. El cliente
 * recibido conserva el alcance de lectura definido por RLS.
 *
 * RFQ-10: se embebe el folio comercial (`pipeline.folio_cnc`) de la cotización
 * de origen para compartirlo como referencia en la orden; si RLS no autoriza la
 * cotización, llega `null` y la orden se muestra igual.
 */
export async function obtenerOrdenesConPartidasServicio(
  cliente: SupabaseClient<Database>,
  estados?: readonly EstadoOrden[],
): Promise<OrdenConPartidas[]> {
  let consultaOrdenes = cliente.from('ordenes_produccion').select('*, pipeline(folio_cnc)');
  if (estados && estados.length > 0) {
    consultaOrdenes = consultaOrdenes.in('estado', estados);
  }

  const { data: filasOrdenes, error: errorOrdenes } = await consultaOrdenes.order('creado_en', {
    ascending: false,
  });
  if (errorOrdenes) {
    throw new ErrorOrden('desconocido', errorOrdenes.message);
  }

  const ordenes = (filasOrdenes ?? []).map((fila) => {
    const { pipeline: cotizacion, ...base } = fila;
    return {
      ...filaAOrden(base as FilaOrden),
      folioCotizacionCnc: cotizacion?.folio_cnc ?? null,
    };
  });
  if (ordenes.length === 0) return [];

  const idsOrdenes = ordenes.map((orden) => orden.id);
  const { data: filasPartidas, error: errorPartidas } = await cliente
    .from('partidas_orden_produccion')
    .select('*, metas_proceso_partida(id, secuencia, nombre, meta_piezas)')
    .in('orden_id', idsOrdenes)
    .order('creado_en', { ascending: true });
  if (errorPartidas) {
    throw new ErrorOrden('desconocido', errorPartidas.message);
  }

  const partidasPorOrden = new Map<string, Partida[]>();
  for (const fila of filasPartidas ?? []) {
    const partida: Partida = {
      ...filaAPartida(fila),
      metasProceso: (fila.metas_proceso_partida ?? [])
        .map((meta) => ({
          id: meta.id,
          secuencia: meta.secuencia,
          nombre: meta.nombre,
          metaPiezas: Number(meta.meta_piezas),
        }))
        .sort((primero, segundo) => primero.secuencia - segundo.secuencia),
    };
    const partidas = partidasPorOrden.get(partida.ordenId) ?? [];
    partidas.push(partida);
    partidasPorOrden.set(partida.ordenId, partidas);
  }

  return ordenes.map((orden) => ({
    orden,
    partidas: partidasPorOrden.get(orden.id) ?? [],
  }));
}

/**
 * Carga únicamente las partidas asignadas a un operador de piso y las OP a las
 * que pertenecen. La consulta usa el cliente admin sólo después de validar la
 * cookie PIN en el servidor; nunca se envían partidas ajenas al navegador.
 */
export async function obtenerOrdenesConPartidasDeOperadorServicio(
  admin: SupabaseClient<Database>,
  operadorId: string,
): Promise<OrdenConPartidas[]> {
  const { data: filasPartidas, error: errorPartidas } = await admin
    .from('partidas_orden_produccion')
    .select('*')
    .eq('operador_asignado_id', operadorId)
    .order('creado_en', { ascending: true });

  if (errorPartidas) {
    throw new ErrorOrden('desconocido', errorPartidas.message);
  }

  const partidas = (filasPartidas ?? []).map(filaAPartida);
  if (partidas.length === 0) return [];

  const idsOrdenes = [...new Set(partidas.map((partida) => partida.ordenId))];
  const { data: filasOrdenes, error: errorOrdenes } = await admin
    .from('ordenes_produccion')
    .select('*')
    .in('id', idsOrdenes)
    .eq('estado', 'en_proceso')
    .order('creado_en', { ascending: false });

  if (errorOrdenes) {
    throw new ErrorOrden('desconocido', errorOrdenes.message);
  }

  const partidasPorOrden = new Map<string, Partida[]>();
  for (const partida of partidas) {
    const partidasDeOrden = partidasPorOrden.get(partida.ordenId) ?? [];
    partidasDeOrden.push(partida);
    partidasPorOrden.set(partida.ordenId, partidasDeOrden);
  }

  return (filasOrdenes ?? []).map((filaOrden) => {
    const orden = filaAOrden(filaOrden);
    return { orden, partidas: partidasPorOrden.get(orden.id) ?? [] };
  });
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
 * Consumo desde piso: además de la transacción de inventario, Postgres verifica
 * que la partida esté asignada al operador autenticado por PIN.
 */
export async function registrarConsumoMaterialOperadorServicio(
  admin: SupabaseClient<Database>,
  entrada: RegistrarConsumoMaterialInput & { operadorId: string },
): Promise<ConsumoMaterialRegistrado> {
  const { data, error } = await admin.rpc('registrar_consumo_material_operador_op', {
    p_partida_id: entrada.partidaId,
    p_material_id: entrada.materialId,
    p_cantidad_usada: entrada.cantidadUsada,
    p_cantidad_scrap: entrada.cantidadScrap,
    p_operador_id: entrada.operadorId,
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

/** Asigna una partida a un operador mediante la RPC bloqueada de planificación. */
export async function asignarOperadorPartidaServicio(
  admin: SupabaseClient<Database>,
  entrada: AsignarOperadorPartidaInput,
): Promise<PartidaConOperadorAsignado> {
  const { data, error } = await admin.rpc('asignar_operador_a_partida_op', {
    p_partida_id: entrada.partidaId,
    p_operador_id: entrada.operadorId,
  });

  if (error) lanzarErrorOrden(error.message);
  const fila = data?.[0];
  if (!fila?.partida_id || !fila.operador_asignado_id) {
    throw new ErrorOrden('desconocido');
  }

  return {
    partidaId: fila.partida_id,
    operadorAsignadoId: fila.operador_asignado_id,
    actualizadoEn: fila.actualizado_en,
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

/**
 * Acumula piezas fabricadas y scrap mediante la RPC de piso. La suma se hace
 * en PostgreSQL bajo locks, nunca con valores leídos previamente en la UI.
 */
export async function registrarAvancePartidaServicio(
  admin: SupabaseClient<Database>,
  entrada: RegistrarAvancePartidaInput & { operadorId: string },
): Promise<AvancePartidaRegistrado> {
  const { data, error } = await admin.rpc('registrar_avance_partida_op', {
    p_partida_id: entrada.partidaId,
    p_operador_id: entrada.operadorId,
    p_cantidad_producida: entrada.cantidadProducida,
    p_cantidad_scrap: entrada.cantidadScrap,
  });

  if (error) lanzarErrorOrden(error.message);
  const fila = data?.[0];
  if (!fila?.partida_id) throw new ErrorOrden('desconocido');

  return {
    partidaId: fila.partida_id,
    cantidadProducida: Number(fila.cantidad_producida),
    cantidadScrap: Number(fila.cantidad_scrap),
    actualizadoEn: fila.actualizado_en,
  };
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
    case 'credito_limite_excedido':
      return 'El cliente alcanzó su límite de crédito';
    case 'cliente_no_corresponde_oportunidad':
      return 'El cliente de la oportunidad cambió. Recarga e inténtalo de nuevo';
    case 'cliente_no_activo':
      return 'El cliente de la oportunidad no está activo';
    case 'sobregiro_requiere_admin_activo':
      return 'Solo un administrador activo puede autorizar un sobrepaso de crédito';
    case 'orden_inexistente':
      return 'La orden no existe o ya no está disponible';
    case 'estado_conflicto':
      return 'La orden fue actualizada por otro usuario. Recarga e inténtalo de nuevo';
    case 'orden_no_editable':
      return 'Solo se puede editar una orden en borrador';
    case 'orden_desactualizada':
      return 'La orden fue actualizada por otra persona. Recarga e inténtalo de nuevo';
    case 'partida_con_historial':
      return 'No se puede retirar una partida con historial de piso o con operador asignado';
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
    case 'cantidad_producida_excede_solicitada':
      return 'La producción buena no puede superar la cantidad solicitada';
    case 'operador_no_asignado_partida':
      return 'La partida no está asignada al operador de la sesión';
    default:
      return mensajeGenerico;
  }
}
