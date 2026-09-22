import type { Json } from '@/compartido/tipos/supabase';

/** Monedas admitidas por los gastos; la rentabilidad se consolida en MXN. */
export const MONEDAS_GASTO = ['MXN', 'USD'] as const;

/** Categorías contables definidas en `public.gastos`. */
export const CATEGORIAS_GASTO = [
  'materia_prima',
  'consumibles',
  'herramentental',
  'maquila_externa',
  'logistica',
  'servicios_generales',
  'nomina',
  'mantenimiento',
  'otros',
] as const;

/** Formato admitido para categorías configurables (CFG-09). */
export const FORMATO_CATEGORIA_GASTO = /^[a-z0-9_]{2,40}$/;

export const ESTADOS_GASTO = ['pendiente', 'pagado', 'cancelado'] as const;

export const METODOS_PAGO_GASTO = [
  'transferencia',
  'efectivo',
  'cheque',
  'tarjeta',
  'credito_proveedor',
] as const;

export type MonedaGasto = (typeof MONEDAS_GASTO)[number];
export type CategoriaGasto = string;
export type EstadoGasto = (typeof ESTADOS_GASTO)[number];
export type MetodoPagoGasto = (typeof METODOS_PAGO_GASTO)[number];
export type MonedaRentabilidad = 'MXN';

/** Fila de dominio de un gasto contable. */
export interface Gasto {
  id: string;
  folio: string;
  ordenId: string | null;
  /** Folio legible de la orden vinculada (OBS-28); null si no se embebió. */
  ordenFolio: string | null;
  proveedorId: string | null;
  categoria: CategoriaGasto;
  descripcion: string;
  montoSubtotal: number;
  montoIva: number;
  montoTotal: number;
  moneda: MonedaGasto;
  tipoCambio: number;
  estadoPago: EstadoGasto;
  fechaGasto: string;
  fechaVencimiento: string | null;
  comprobanteUrl: string | null;
  folioComprobante: string | null;
  metodoPago: MetodoPagoGasto | null;
  datosOcrJson: Json | null;
  notas: string | null;
  creadoPor: string;
  creadoEn: string;
  actualizadoEn: string;
}

/** Forma snake_case que devuelve Supabase antes de mapearla al dominio. */
export interface FilaGasto {
  id: string;
  folio: string;
  orden_id: string | null;
  proveedor_id: string | null;
  categoria: string;
  descripcion: string;
  monto_subtotal: number | string;
  monto_iva: number | string;
  monto_total: number | string;
  moneda: string;
  tipo_cambio: number | string;
  estado_pago: string;
  fecha_gasto: string;
  fecha_vencimiento: string | null;
  comprobante_url: string | null;
  folio_comprobante: string | null;
  metodo_pago: string | null;
  datos_ocr_json: Json | null;
  notas: string | null;
  creado_por: string;
  creado_en: string;
  actualizado_en: string;
}

export const COMPONENTES_RENTABILIDAD = [
  'ingreso',
  'materiales',
  'mano_obra',
  'gastos',
] as const;

export type ComponenteRentabilidad = (typeof COMPONENTES_RENTABILIDAD)[number];

/**
 * OBS-29: categorías que ya están representadas por los rubros de material
 * (consumo real) y mano de obra (sesiones con tarifa histórica). Sumarlas otra
 * vez duplicaría el costo; la UI las muestra marcadas y el RPC las cuenta en
 * `gastosIncluidosEnRubros`.
 */
export const CATEGORIAS_INCLUIDAS_EN_RUBROS = ['materia_prima', 'nomina'] as const;

export function categoriaIncluidaEnRubros(categoria: string): boolean {
  return (CATEGORIAS_INCLUIDAS_EN_RUBROS as readonly string[]).includes(categoria);
}

/** Rubros del desglose de rentabilidad (OBS-29). */
export const RUBROS_DESGLOSE_RENTABILIDAD = [
  'mano_obra',
  'material',
  'gasto',
  'gasto_incluido',
] as const;

export type RubroDesgloseRentabilidad = (typeof RUBROS_DESGLOSE_RENTABILIDAD)[number];

/** Renglón del desglose por estación/rubro de una orden. */
export interface DesgloseRentabilidadOrden {
  rubro: RubroDesgloseRentabilidad;
  concepto: string;
  referencia: string | null;
  horasEstimadas: number | null;
  horasReales: number | null;
  tarifaHora: number | null;
  importe: number;
  nota: string | null;
}

/** Resultado consolidado en MXN, incluyendo indicadores de datos faltantes. */
export interface CalculoRentabilidadOrden {
  ordenId: string;
  /** Folio de la orden para el encabezado de la tarjeta. */
  folio: string;
  /** Trabajo interno (TI): no genera venta ni AR; se informa su costo. */
  esInterna: boolean;
  moneda: MonedaRentabilidad;
  ingresoMxn: number;
  costoMaterialesMxn: number;
  costoManoObraMxn: number;
  costoGastosDirectosMxn: number;
  costoTotalMxn: number;
  utilidadBrutaMxn: number;
  margenPorcentaje: number | null;
  margenCalculable: boolean;
  materialesConsiderados: number;
  sesionesConsideradas: number;
  sesionesSinTarifa: number;
  gastosConsiderados: number;
  gastosExcluidos: number;
  /** OBS-29: gastos de material/nómina que no se sumaron por anti-duplicado. */
  gastosIncluidosEnRubros: number;
  componentesFaltantes: readonly ComponenteRentabilidad[];
}

/** Resultado sugerido por OCR; siempre requiere confirmación contable. */
export interface DatosComprobanteOCR {
  proveedorSugerido: string | null;
  rfc: string | null;
  folioFactura: string | null;
  montoSubtotal: number | null;
  montoIva: number | null;
  montoTotal: number | null;
  moneda: MonedaGasto | null;
  fechaEmision: string | null;
  confianza: number;
  advertencias: readonly string[];
}

function validarEnumerado<T extends string>(
  valor: string,
  valores: readonly T[],
  campo: string,
): T {
  if (!valores.includes(valor as T)) {
    throw new Error(`Valor inválido en ${campo}: ${valor}`);
  }

  return valor as T;
}

function numeroDeFila(valor: number | string, campo: string): number {
  const numero = typeof valor === 'number' ? valor : Number(valor);

  if (!Number.isFinite(numero)) {
    throw new Error(`Importe inválido en ${campo}: ${String(valor)}`);
  }

  return numero;
}

/** Mapea una fila de Supabase y rompe ante enums o importes ilegibles. */
export function filaAGasto(fila: FilaGasto): Gasto {
  return {
    id: fila.id,
    folio: fila.folio,
    ordenId: fila.orden_id,
    ordenFolio: null,
    proveedorId: fila.proveedor_id,
    categoria: FORMATO_CATEGORIA_GASTO.test(fila.categoria) ? fila.categoria : 'otros',
    descripcion: fila.descripcion,
    montoSubtotal: numeroDeFila(fila.monto_subtotal, 'monto_subtotal'),
    montoIva: numeroDeFila(fila.monto_iva, 'monto_iva'),
    montoTotal: numeroDeFila(fila.monto_total, 'monto_total'),
    moneda: validarEnumerado(fila.moneda, MONEDAS_GASTO, 'moneda'),
    tipoCambio: numeroDeFila(fila.tipo_cambio, 'tipo_cambio'),
    estadoPago: validarEnumerado(fila.estado_pago, ESTADOS_GASTO, 'estado_pago'),
    fechaGasto: fila.fecha_gasto,
    fechaVencimiento: fila.fecha_vencimiento,
    comprobanteUrl: fila.comprobante_url,
    folioComprobante: fila.folio_comprobante,
    metodoPago: fila.metodo_pago === null
      ? null
      : validarEnumerado(fila.metodo_pago, METODOS_PAGO_GASTO, 'método_pago'),
    datosOcrJson: fila.datos_ocr_json,
    notas: fila.notas,
    creadoPor: fila.creado_por,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}
