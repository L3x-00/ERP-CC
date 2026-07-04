import type { Tables } from '@/compartido/tipos/supabase';

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
  motivoPerdida: string | null;
  notasPerdida: string | null;
  fechaUltimoContacto: string | null;
  fechaEnvioCotizacion: string | null;
  creadoEn: string;
  actualizadoEn: string;
};

/** Línea de cotización persistida. */
export type LineaCotizacion = {
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

/** Convierte una fila de pipeline (snake_case) a Oportunidad (camelCase). */
export function filaAOportunidad(fila: FilaPipeline): Oportunidad {
  return {
    id: fila.id,
    folioOp: fila.folio_op,
    folioCnc: fila.folio_cnc,
    etapa: fila.etapa as EtapaPipeline,
    nombreContacto: fila.nombre_contacto,
    empresa: fila.empresa,
    correo: fila.correo,
    telefono: fila.telefono,
    clienteId: fila.cliente_id,
    vendedorId: fila.vendedor_id,
    moneda: fila.moneda as MonedaPipeline,
    condicionesPago: fila.condiciones_pago as CondicionesPago | null,
    prioridad: fila.prioridad as PrioridadPipeline,
    ivaPorcentaje: Number(fila.iva_porcentaje),
    etiquetas: fila.etiquetas,
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
