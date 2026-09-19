import { calcularTotalesCotizacion } from '@/modulos/pipeline/servicios/calcular-totales-cotizacion';
import type { Tables } from '@/compartido/tipos/supabase';

/**
 * Contratos del historial 360° del cliente (cotizaciones y órdenes).
 *
 * Se declaran aquí en lugar de reutilizar `@/modulos/pipeline/tipos/indice`
 * para que la ficha del cliente no dependa del contrato editable del cotizador:
 * el historial es solo lectura y su superficie es deliberadamente menor (no
 * incluye costos, márgenes ni datos de Cobranza, que `ver_clientes` no autoriza).
 */

/** Etapa de la oportunidad tal como la publica `pipeline.etapa`. */
export type EtapaHistorial =
  | 'prospecto'
  | 'contactado'
  | 'cotizado'
  | 'negociacion'
  | 'ganada'
  | 'perdida';

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
  etapa: EtapaHistorial;
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
  /** Suma de importes de `lineas`; `null` cuando las líneas no son legibles. */
  subtotal: number | null;
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

// Filas crudas de Supabase (snake_case) derivadas de los tipos generados.
export type FilaPipelineHistorial = Pick<Tables<'pipeline'>, 'id' | 'folio_op' | 'folio_cnc' | 'etapa' | 'moneda' | 'iva_porcentaje' | 'fecha_envio_cotizacion' | 'creado_en' | 'actualizado_en'>;
export type FilaLineaCotizacionHistorial = Pick<Tables<'cotizacion_lineas'>, 'id' | 'pipeline_id' | 'descripcion' | 'cantidad' | 'material' | 'espesor' | 'area' | 'procesos' | 'precio_unitario' | 'es_descuento' | 'orden'>;
export type FilaOrdenHistorial = Pick<Tables<'ordenes_produccion'>, 'id' | 'folio' | 'estado' | 'prioridad' | 'cotizacion_id' | 'fecha_compromiso' | 'fecha_inicio' | 'fecha_fin' | 'creado_en'>;
export type FilaPartidaOrdenHistorial = Pick<Tables<'partidas_orden_produccion'>, 'id' | 'orden_id' | 'codigo_pieza' | 'descripcion' | 'cantidad_solicitada' | 'cantidad_producida' | 'cantidad_scrap' | 'unidad_medida' | 'maquina_asignada' | 'tiempo_estimado_minutos' | 'tiempo_real_minutos'>;

const ETAPAS: readonly EtapaHistorial[] = [
  'prospecto',
  'contactado',
  'cotizado',
  'negociacion',
  'ganada',
  'perdida',
];

const MONEDAS: readonly MonedaHistorial[] = ['MXN', 'USD'];

/** Redondea a 2 decimales evitando el error de flotante (0.1 + 0.2). */
function redondear(cantidad: number): number {
  return Math.round((cantidad + Number.EPSILON) * 100) / 100;
}

/**
 * Rechaza un enumerado desconocido para no inventar estados o monedas.
 */
function normalizarEtapa(valor: string): EtapaHistorial {
  if (!(ETAPAS as readonly string[]).includes(valor)) throw new Error('Etapa no reconocida en historial');
  return valor as EtapaHistorial;
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
 */
export function filaACotizacionHistorial(
  fila: FilaPipelineHistorial,
  lineas: LineaCotizacionHistorial[] | null,
): CotizacionHistorial {
  return {
    id: fila.id,
    folioOp: fila.folio_op,
    folioCnc: fila.folio_cnc,
    etapa: normalizarEtapa(fila.etapa),
    moneda: normalizarMoneda(fila.moneda),
    ivaPorcentaje: Number(fila.iva_porcentaje),
    fechaEnvioCotizacion: fila.fecha_envio_cotizacion,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
    lineas,
    subtotal:
      lineas === null ? null : calcularTotalesCotizacion(lineas, Number(fila.iva_porcentaje), normalizarMoneda(fila.moneda)).subtotal,
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
