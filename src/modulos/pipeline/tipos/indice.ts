import type { Tables } from '@/compartido/tipos/supabase';
import { esquemaSnapshotTecnico } from '@/modulos/cotizador/validaciones/snapshot';

/** Etapas del pipeline (orden de avance; ganada/perdida son terminales). */
export type EtapaPipeline =
  | 'prospecto'
  | 'contactado'
  | 'cotizado'
  | 'negociacion'
  | 'ganada'
  | 'perdida';

export type MonedaPipeline = 'MXN' | 'USD';
export type CondicionesPago = 'contado' | '15_dias' | '30_dias' | 'credito';
export type PrioridadPipeline = 'baja' | 'normal' | 'alta' | 'urgente';

/** Oportunidad del CRM (camelCase; ver mapeo desde FilaPipeline). */
export type Oportunidad = {
  id: string;
  folioOp: string;
  folioCnc: string | null;
  etapa: EtapaPipeline;
  nombreContacto: string;
  empresa: string;
  correo: string | null;
  telefono: string | null;
  clienteId: string | null;
  vendedorId: string;
  moneda: MonedaPipeline;
  condicionesPago: CondicionesPago | null;
  prioridad: PrioridadPipeline;
  ivaPorcentaje: number;
  etiquetas: string[];
  /** RFQ-09: la oportunidad es un trabajo interno (TI). */
  esOrdenInterna: boolean;
  /**
   * RFQ-14: subtotal de la cotización (suma de líneas, en la moneda de la
   * oportunidad) — solo se llena en el listado del tablero, que embebe las
   * líneas. Es `undefined` en rutas que no las cargan. No mezclar entre monedas
   * al agregar (ver `resumirPipeline`).
   */
  importeSubtotal?: number;
  /**
   * RFQ-14: orden de producción vinculada (por `cotizacion_id`), si existe —
   * solo se llena en el listado del tablero (embebido). `undefined` en rutas que
   * no la cargan; `null` si la oportunidad aún no generó orden.
   */
  ordenVinculada?: { folio: string; estado: string } | null;
  /** RFQ-01: datos de captura de la solicitud comercial. */
  poCliente: string | null;
  fechaRequerida: string | null;
  horasEstimadas: number | null;
  notas: string | null;
  motivoPerdida: string | null;
  notasPerdida: string | null;
  fechaUltimoContacto: string | null;
  fechaEnvioCotizacion: string | null;
  creadoEn: string;
  actualizadoEn: string;
};

/** Línea de cotización persistida. */
export type LineaCotizacion = {
  calculoTecnico?: import('@/modulos/cotizador/tipos/indice').CotizacionTecnicaCalculada;
  id: string;
  pipelineId: string;
  descripcion: string;
  cantidad: number;
  material: string | null;
  espesor: string | null;
  area: number | null;
  procesos: string[];
  precioUnitario: number;
  orden: number;
  creadoEn: string;
};

/** Línea aún no persistida (entrada del cotizador, para calcular totales). */
export type LineaCotizacionEntrada = {
  calculoTecnico?: import('@/modulos/cotizador/tipos/indice').CotizacionTecnicaCalculada;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  material?: string | null;
  espesor?: string | null;
  area?: number | null;
  procesos?: string[];
};

/** Totales calculados de una cotización. */
export type TotalesCotizacion = {
  subtotal: number;
  iva: number;
  ivaPorcentaje: number;
  total: number;
  moneda: MonedaPipeline;
};

/** Datos mínimos de cliente creados al promover una oportunidad ganada. */
export type ClienteMinimo = {
  id: string;
  nombreComercial: string;
  rfc: string | null;
  contacto: string | null;
  correo: string | null;
  telefono: string | null;
};

// Filas crudas de Supabase (snake_case) derivadas de los tipos generados.
export type FilaPipeline = Tables<'pipeline'>;
export type FilaLineaCotizacion = Tables<'cotizacion_lineas'>;
export type FilaCliente = Tables<'clientes'>;

export const ETAPAS_PIPELINE: readonly EtapaPipeline[] = [
  'prospecto',
  'contactado',
  'cotizado',
  'negociacion',
  'ganada',
  'perdida',
];

const MONEDAS_PIPELINE: readonly MonedaPipeline[] = ['MXN', 'USD'];
const CONDICIONES_PAGO_PIPELINE: readonly CondicionesPago[] = [
  'contado',
  '15_dias',
  '30_dias',
  'credito',
];
export const PRIORIDADES_PIPELINE: readonly PrioridadPipeline[] = ['baja', 'normal', 'alta', 'urgente'];

/**
 * Convierte un valor de BD a un enum de dominio; lanza si la BD trae un valor
 * fuera del contrato (drift/migración) en lugar de dejarlo pasar con un `as`.
 */
function validarEnumerado<T extends string>(
  valor: string,
  permitidos: readonly T[],
  campo: string,
): T {
  if (!(permitidos as readonly string[]).includes(valor)) {
    throw new Error(`Valor fuera de contrato en pipeline: ${campo}`);
  }
  return valor as T;
}

/** Convierte una fila de pipeline (snake_case) a Oportunidad (camelCase). */
export function filaAOportunidad(fila: FilaPipeline): Oportunidad {
  return {
    id: fila.id,
    folioOp: fila.folio_op,
    folioCnc: fila.folio_cnc,
    etapa: validarEnumerado(fila.etapa, ETAPAS_PIPELINE, 'etapa'),
    nombreContacto: fila.nombre_contacto,
    empresa: fila.empresa,
    correo: fila.correo,
    telefono: fila.telefono,
    clienteId: fila.cliente_id,
    vendedorId: fila.vendedor_id,
    moneda: validarEnumerado(fila.moneda, MONEDAS_PIPELINE, 'moneda'),
    condicionesPago:
      fila.condiciones_pago === null
        ? null
        : validarEnumerado(fila.condiciones_pago, CONDICIONES_PAGO_PIPELINE, 'condiciones_pago'),
    prioridad: validarEnumerado(fila.prioridad, PRIORIDADES_PIPELINE, 'prioridad'),
    ivaPorcentaje: Number(fila.iva_porcentaje),
    etiquetas: fila.etiquetas,
    esOrdenInterna: fila.es_orden_interna,
    poCliente: fila.po_cliente,
    fechaRequerida: fila.fecha_requerida,
    horasEstimadas: fila.horas_estimadas === null ? null : Number(fila.horas_estimadas),
    notas: fila.notas,
    motivoPerdida: fila.motivo_perdida,
    notasPerdida: fila.notas_perdida,
    fechaUltimoContacto: fila.fecha_ultimo_contacto,
    fechaEnvioCotizacion: fila.fecha_envio_cotizacion,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}

/** Convierte una fila de cotizacion_lineas (snake_case) a LineaCotizacion. */
export function filaALineaCotizacion(fila: FilaLineaCotizacion): LineaCotizacion {
  const lectura = esquemaSnapshotTecnico.safeParse(fila.calculo_tecnico);
  // Un cálculo antiguo o inválido no debe impedir consultar la partida comercial.
  const calculo = lectura.success && lectura.data.entrada.cantidad === Number(fila.cantidad)
    && lectura.data.precioUnitario === Number(fila.precio_unitario) ? lectura.data : undefined;
  return {
    id: fila.id,
    pipelineId: fila.pipeline_id,
    descripcion: fila.descripcion,
    cantidad: Number(fila.cantidad),
    material: fila.material,
    espesor: fila.espesor,
    area: fila.area === null ? null : Number(fila.area),
    procesos: fila.procesos,
    precioUnitario: Number(fila.precio_unitario),
    orden: fila.orden,
    creadoEn: fila.creado_en,
    ...(calculo ? { calculoTecnico: calculo } : {}),
  };
}

/** Convierte una fila de clientes (snake_case) a ClienteMinimo. */
export function filaAClienteMinimo(fila: FilaCliente): ClienteMinimo {
  return {
    id: fila.id,
    nombreComercial: fila.nombre_comercial,
    rfc: fila.rfc,
    contacto: fila.contacto,
    correo: fila.correo,
    telefono: fila.telefono,
  };
}
