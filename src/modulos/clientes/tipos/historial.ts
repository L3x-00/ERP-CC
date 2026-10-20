import { calcularTotalesCotizacion } from '@/modulos/pipeline/servicios/calcular-totales-cotizacion';
import type { Tables } from '@/compartido/tipos/supabase';
import {
  resolverImporteCotizacion,
  resumirItemsRevision,
} from '@/modulos/clientes/servicios/importe-historial';
import { ESTADOS_PROPIESTA, type EstadoPropuesta } from '@/modulos/propuestas/tipos/indice';
import {
  normalizarEstadoRfq,
  type EstadoRfq,
} from '@/modulos/rfq/tipos/indice';

/**
 * Contratos del historial 360° del cliente (cotizaciones, propuestas y órdenes).
 *
 * Se declaran aquí en lugar de reutilizar `@/modulos/pipeline/tipos/indice`
 * para que la ficha del cliente no dependa del contrato editable del cotizador:
 * el historial es solo lectura y su superficie es deliberadamente menor (no
 * incluye costos, márgenes ni datos de Cobranza, que `ver_clientes` no autoriza).
 */

/** Estado del RFQ tal como lo publica `pipeline.estado_rfq` (ola 2). */
export type EstadoHistorial = EstadoRfq;

/** Moneda de la cotización. */
export type MonedaHistorial = 'MXN' | 'USD';

/** Línea de una cotización con sus campos técnicos. */
export type LineaCotizacionHistorial = {
  id: string;
  descripcion: string;
  cantidad: number;
  material: string | null;
  espesor: string | null;
  area: number | null;
  procesos: string[];
  precioUnitario: number;
  /** RFQ-03: la línea es un descuento; `importe` se guarda en negativo. */
  esDescuento: boolean;
  /** `cantidad * precioUnitario` con signo (negativo si es descuento). */
  importe: number;
  orden: number;
};

/** Cotización (oportunidad) visible en el historial del cliente. */
export type CotizacionHistorial = {
  id: string;
  folioOp: string;
  folioCnc: string | null;
  folioRfq: string | null;
  estadoRfq: EstadoHistorial;
  moneda: MonedaHistorial;
  ivaPorcentaje: number;
  fechaEnvioCotizacion: string | null;
  creadoEn: string;
  actualizadoEn: string;
  /**
   * Líneas legibles bajo RLS. `null` significa "no autorizadas o no
   * recuperables", que no es lo mismo que una cotización sin líneas (`[]`).
   */
  lineas: LineaCotizacionHistorial[] | null;
  /**
   * Suma de importes de `lineas` (solo el cotizador anterior); `null` cuando no
   * son legibles. Un `0` aquí NO es el importe de la cotización: una cotización
   * convertida a Propuesta no tiene líneas en el cotizador anterior. Para
   * mostrar dinero usar `importe`.
   */
  subtotal: number | null;
  /** Importe que se puede mostrar, con su origen o la razón por la que falta. */
  importe: ImporteCotizacionHistorial;
};

/** Revisión/propuesta de la que sale un importe, para rotularlo en la UI. */
export type OrigenImporteHistorial = {
  propuestaId: string;
  folioCnc: string;
  folioRevision: string;
  letra: string;
  estadoRevision: EstadoPropuesta;
  /** `true` si es la revisión aceptada por el cliente. */
  aceptada: boolean;
};

/**
 * Importe de una cotización. Distingue un monto real (aunque sea cero) de un
 * dato ausente, de uno que el rol no puede ver y de un error de lectura:
 * - `cotizador`: líneas del cotizador anterior (flujo histórico); solo cuando
 *   la cotización no tiene una revisión aceptada.
 * - `propuesta`: subtotal/IVA/total de la revisión apropiada de la Propuesta;
 *   la revisión aceptada prevalece sobre las líneas del cotizador anterior.
 * - `pendiente`: hay Propuesta pero sin precio capturado (borrador sin precios
 *   o sin ítems activos); no es un cero.
 * - `sin-datos`: ni cotizador anterior ni Propuesta registran importe.
 * - `sin-permiso`: el rol no ve Propuestas y el cotizador anterior está vacío.
 * - `error`: alguna lectura necesaria falló; no se afirma ningún monto.
 */
export type ImporteCotizacionHistorial =
  | { tipo: 'cotizador'; subtotal: number; moneda: MonedaHistorial }
  | {
      tipo: 'propuesta';
      subtotal: number;
      /** `null` si el IVA de la revisión no es legible. */
      iva: number | null;
      total: number | null;
      moneda: MonedaHistorial;
      origen: OrigenImporteHistorial;
    }
  | { tipo: 'pendiente'; origen: OrigenImporteHistorial }
  | { tipo: 'sin-datos' }
  | { tipo: 'sin-permiso' }
  | { tipo: 'error' };

/** Importe comercial de una revisión (solo precios de venta; sin costos). */
export type ImporteRevisionHistorial = {
  subtotal: number;
  /** `null` si el porcentaje de IVA de la cabecera no es legible. */
  iva: number | null;
  total: number | null;
  ivaPorcentaje: number | null;
  moneda: MonedaHistorial;
};

/** Evento de transición de una revisión (bitácora; sin actor). */
export type EventoRevisionHistorial = {
  id: string;
  accion: string;
  estadoAnterior: EstadoPropuesta | null;
  estadoNuevo: EstadoPropuesta | null;
  motivo: string | null;
  canal: string | null;
  destino: string | null;
  creadoEn: string;
};

/** Revisión A..Z de una propuesta, con lo necesario para mostrar su importe. */
export type RevisionComercialHistorial = {
  id: string;
  propuestaId: string;
  letra: string;
  folioRevision: string;
  estado: EstadoPropuesta;
  motivoCreacion: string | null;
  enviadoEn: string | null;
  validadaEn: string | null;
  creadoEn: string;
  actualizadoEn: string;
  /** Ítems activos; `null` si los ítems no son legibles. */
  partidasActivas: number | null;
  /** `true` si algún ítem activo tiene precio > 0; `null` si no son legibles. */
  conPrecio: boolean | null;
  /** `null` si los ítems no son legibles o la moneda de la cabecera no se reconoce. */
  importe: ImporteRevisionHistorial | null;
};

/** Revisión con su bitácora; `eventos` es `null` si no fue legible. */
export type RevisionHistorial = RevisionComercialHistorial & {
  eventos: EventoRevisionHistorial[] | null;
};

/** Propuesta (cabecera) con sus revisiones; `revisiones` es `null` si no fueron legibles. */
export type PropuestaComercialHistorial = {
  id: string;
  rfqId: string;
  folioCnc: string;
  estado: EstadoPropuesta;
  revisionVigenteId: string | null;
  revisionAceptadaId: string | null;
  creadoEn: string;
  actualizadoEn: string;
  revisiones: RevisionComercialHistorial[] | null;
};

/** Propuesta del cliente con revisiones y eventos históricos. */
export type PropuestaHistorial = Omit<PropuestaComercialHistorial, 'revisiones'> & {
  revisiones: RevisionHistorial[] | null;
};

/** Estado de la orden de producción tal como lo publica `ordenes_produccion`. */
export type EstadoOrdenHistorial = string;

/** Partida técnica de una orden (sin datos de costo). */
export type PartidaOrdenHistorial = {
  id: string;
  codigoPieza: string;
  descripcion: string | null;
  cantidadSolicitada: number;
  cantidadProducida: number;
  cantidadScrap: number;
  unidadMedida: string;
  maquinaAsignada: string | null;
  tiempoEstimadoMinutos: number;
  tiempoRealMinutos: number;
};

/** Orden de producción visible en el historial del cliente. */
export type OrdenHistorial = {
  id: string;
  folio: string;
  estado: EstadoOrdenHistorial;
  prioridad: string;
  cotizacionId: string | null;
  fechaCompromiso: string;
  fechaInicio: string | null;
  fechaFin: string | null;
  creadoEn: string;
  /** Partidas legibles bajo RLS; `null` si no se pudieron recuperar. */
  partidas: PartidaOrdenHistorial[] | null;
};

/** Página de una de las dos entidades del historial (se paginan por separado). */
export type PaginaHistorial<T> = {
  registros: T[];
  total: number;
  pagina: number;
  porPagina: number;
};

/**
 * OBS-11: nota operativa escrita por un operador y vinculada automáticamente al
 * historial del cliente. Son notas internas de taller (D-14): no se envían al
 * cliente ni se exponen fuera de la ficha.
 */
export type NotaOperativaCliente = {
  id: string;
  /** `sesion` = cierre de sesión de trabajo; `tiempo` = pausa/cierre de tiempo. */
  origen: 'sesion' | 'tiempo';
  /** Acción registrada cuando `origen` es `tiempo` (p. ej. `pausa`). */
  accion: string | null;
  fecha: string;
  autorId: string;
  autorNombre: string;
  ordenId: string;
  ordenFolio: string;
  partidaCodigo: string | null;
  texto: string;
};

// Filas crudas de Supabase (snake_case) derivadas de los tipos generados.
export type FilaPipelineHistorial = Pick<Tables<'pipeline'>, 'id' | 'folio_op' | 'folio_cnc' | 'folio_rfq' | 'estado_rfq' | 'moneda' | 'iva_porcentaje' | 'fecha_envio_cotizacion' | 'creado_en' | 'actualizado_en'>;
export type FilaLineaCotizacionHistorial = Pick<Tables<'cotizacion_lineas'>, 'id' | 'pipeline_id' | 'descripcion' | 'cantidad' | 'material' | 'espesor' | 'area' | 'procesos' | 'precio_unitario' | 'es_descuento' | 'orden'>;
export type FilaOrdenHistorial = Pick<Tables<'ordenes_produccion'>, 'id' | 'folio' | 'estado' | 'prioridad' | 'cotizacion_id' | 'fecha_compromiso' | 'fecha_inicio' | 'fecha_fin' | 'creado_en'>;
export type FilaPartidaOrdenHistorial = Pick<Tables<'partidas_orden_produccion'>, 'id' | 'orden_id' | 'codigo_pieza' | 'descripcion' | 'cantidad_solicitada' | 'cantidad_producida' | 'cantidad_scrap' | 'unidad_medida' | 'maquina_asignada' | 'tiempo_estimado_minutos' | 'tiempo_real_minutos'>;
export type FilaPropuestaHistorial = Pick<Tables<'propuestas'>, 'id' | 'rfq_id' | 'folio_cnc' | 'estado' | 'revision_vigente_id' | 'accepted_revision_id' | 'creado_en' | 'actualizado_en'>;
/**
 * De la cabecera JSONB solo se leen moneda e IVA (`snapshot_cabecera->>…`): el
 * resto es copia de datos del cliente y del contacto que el historial no usa.
 */
export type FilaRevisionHistorial = Pick<Tables<'propuesta_revisiones'>, 'id' | 'propuesta_id' | 'letra' | 'folio_revision' | 'estado' | 'motivo_creacion' | 'enviado_en' | 'validada_en' | 'creado_en' | 'actualizado_en'> & {
  moneda: string | null;
  iva_porcentaje: string | null;
};
export type FilaItemPropuestaHistorial = Pick<Tables<'propuesta_items'>, 'id' | 'revision_id' | 'cantidad' | 'precio_unitario' | 'es_descuento' | 'activo'>;
export type FilaEventoRevisionHistorial = Pick<Tables<'propuesta_revision_eventos'>, 'id' | 'revision_id' | 'accion' | 'estado_anterior' | 'estado_nuevo' | 'motivo' | 'canal' | 'destino' | 'creado_en'>;

const MONEDAS: readonly MonedaHistorial[] = ['MXN', 'USD'];

/** Redondea a 2 decimales evitando el error de flotante (0.1 + 0.2). */
function redondear(cantidad: number): number {
  return Math.round((cantidad + Number.EPSILON) * 100) / 100;
}

function normalizarMoneda(valor: string): MonedaHistorial {
  if (!(MONEDAS as readonly string[]).includes(valor)) throw new Error('Moneda no reconocida en historial');
  return valor as MonedaHistorial;
}

/** Convierte una fila de `cotizacion_lineas` a línea del historial con importe. */
export function filaALineaCotizacionHistorial(
  fila: FilaLineaCotizacionHistorial,
): LineaCotizacionHistorial {
  const cantidad = Number(fila.cantidad);
  const precioUnitario = Number(fila.precio_unitario);
  return {
    id: fila.id,
    descripcion: fila.descripcion,
    cantidad,
    material: fila.material,
    espesor: fila.espesor,
    area: fila.area === null ? null : Number(fila.area),
    procesos: fila.procesos ?? [],
    precioUnitario,
    // RFQ-03: el descuento se muestra como importe negativo para que el
    // subtotal del historial cuadre sin que la UI tenga que saber de la bandera.
    esDescuento: fila.es_descuento,
    importe: redondear((fila.es_descuento ? -1 : 1) * cantidad * precioUnitario),
    orden: fila.orden,
  };
}

/**
 * Convierte una fila de `pipeline` a cotización del historial.
 *
 * @param fila Fila cruda de la oportunidad.
 * @param lineas Líneas legibles, o `null` si RLS/consulta no las entregó.
 * @param propuestas Propuestas del RFQ con sus revisiones: `undefined` si no se
 *   consultaron (el rol no ve Propuestas), `null` si la lectura falló.
 */
export function filaACotizacionHistorial(
  fila: FilaPipelineHistorial,
  lineas: LineaCotizacionHistorial[] | null,
  propuestas?: readonly PropuestaComercialHistorial[] | null,
): CotizacionHistorial {
  const moneda = normalizarMoneda(fila.moneda);
  const subtotal =
    lineas === null ? null : calcularTotalesCotizacion(lineas, Number(fila.iva_porcentaje), moneda).subtotal;
  return {
    id: fila.id,
    folioOp: fila.folio_op,
    folioCnc: fila.folio_cnc,
    folioRfq: fila.folio_rfq,
    estadoRfq: normalizarEstadoRfq(fila.estado_rfq),
    moneda,
    ivaPorcentaje: Number(fila.iva_porcentaje),
    fechaEnvioCotizacion: fila.fecha_envio_cotizacion,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
    lineas,
    subtotal,
    importe: resolverImporteCotizacion({ lineas, subtotalLineas: subtotal, moneda, propuestas }),
  };
}

function normalizarEstadoPropuesta(valor: string): EstadoPropuesta {
  if (!(ESTADOS_PROPIESTA as readonly string[]).includes(valor)) {
    throw new Error('Estado de propuesta no reconocido en historial');
  }
  return valor as EstadoPropuesta;
}

function estadoPropuestaONull(valor: string | null): EstadoPropuesta | null {
  return valor === null ? null : normalizarEstadoPropuesta(valor);
}

/** Texto numérico de un `->>` de JSONB a número; `null` si falta o no es finito. */
function numeroONull(valor: string | number | null): number | null {
  if (valor === null || (typeof valor === 'string' && valor.trim() === '')) return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

/** Convierte una fila de `propuestas` a cabecera del historial (sin revisiones). */
export function filaAPropuestaComercialHistorial(
  fila: FilaPropuestaHistorial,
  revisiones: RevisionComercialHistorial[] | null,
): PropuestaComercialHistorial {
  return {
    id: fila.id,
    rfqId: fila.rfq_id,
    folioCnc: fila.folio_cnc,
    estado: normalizarEstadoPropuesta(fila.estado),
    revisionVigenteId: fila.revision_vigente_id,
    revisionAceptadaId: fila.accepted_revision_id,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
    revisiones,
  };
}

/**
 * Convierte una fila de `propuesta_revisiones` y los ítems de esa revisión a
 * revisión del historial.
 *
 * @param items Ítems de la revisión, o `null` si no fueron legibles.
 */
export function filaARevisionComercialHistorial(
  fila: FilaRevisionHistorial,
  items: readonly FilaItemPropuestaHistorial[] | null,
): RevisionComercialHistorial {
  const moneda = (MONEDAS as readonly string[]).includes(fila.moneda ?? '')
    ? (fila.moneda as MonedaHistorial)
    : null;
  const resumen = resumirItemsRevision({
    items:
      items === null
        ? null
        : items.map((item) => ({
            cantidad: Number(item.cantidad),
            precioUnitario: Number(item.precio_unitario),
            esDescuento: item.es_descuento,
            activo: item.activo,
          })),
    moneda,
    ivaPorcentaje: numeroONull(fila.iva_porcentaje),
  });
  return {
    id: fila.id,
    propuestaId: fila.propuesta_id,
    letra: fila.letra,
    folioRevision: fila.folio_revision,
    estado: normalizarEstadoPropuesta(fila.estado),
    motivoCreacion: fila.motivo_creacion,
    enviadoEn: fila.enviado_en,
    validadaEn: fila.validada_en,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
    ...resumen,
  };
}

/** Convierte una fila de `propuesta_revision_eventos` a evento del historial. */
export function filaAEventoRevisionHistorial(
  fila: FilaEventoRevisionHistorial,
): EventoRevisionHistorial {
  return {
    id: fila.id,
    accion: fila.accion,
    estadoAnterior: estadoPropuestaONull(fila.estado_anterior),
    estadoNuevo: estadoPropuestaONull(fila.estado_nuevo),
    motivo: fila.motivo,
    canal: fila.canal,
    destino: fila.destino,
    creadoEn: fila.creado_en,
  };
}

/** Convierte una fila de `partidas_orden_produccion` a partida del historial. */
export function filaAPartidaOrdenHistorial(
  fila: FilaPartidaOrdenHistorial,
): PartidaOrdenHistorial {
  return {
    id: fila.id,
    codigoPieza: fila.codigo_pieza,
    descripcion: fila.descripcion,
    cantidadSolicitada: Number(fila.cantidad_solicitada),
    cantidadProducida: Number(fila.cantidad_producida),
    cantidadScrap: Number(fila.cantidad_scrap),
    unidadMedida: fila.unidad_medida,
    maquinaAsignada: fila.maquina_asignada,
    tiempoEstimadoMinutos: Number(fila.tiempo_estimado_minutos),
    tiempoRealMinutos: Number(fila.tiempo_real_minutos),
  };
}

/** Convierte una fila de `ordenes_produccion` a orden del historial. */
export function filaAOrdenHistorial(
  fila: FilaOrdenHistorial,
  partidas: PartidaOrdenHistorial[] | null,
): OrdenHistorial {
  return {
    id: fila.id,
    folio: fila.folio,
    estado: fila.estado,
    prioridad: fila.prioridad,
    cotizacionId: fila.cotizacion_id,
    fechaCompromiso: fila.fecha_compromiso,
    fechaInicio: fila.fecha_inicio,
    fechaFin: fila.fecha_fin,
    creadoEn: fila.creado_en,
    partidas,
  };
}
