import type { CondicionesPago } from '@/modulos/pipeline/tipos/indice';

/** Estados del ciclo de vida de un RFQ (ADR-SII-07, §3.2). */
export const ESTADOS_RFQ = [
  'NEW',
  'INCOMPLETE',
  'WAITING_CUSTOMER',
  'WAITING_TECHNICAL',
  'READY_FOR_PROPOSAL',
  'CONVERTED',
  'CLOSED',
  'CANCELLED',
] as const;

export type EstadoRfq = (typeof ESTADOS_RFQ)[number];

/** Acciones de negocio que mueven el estado del RFQ. */
export const ACCIONES_RFQ = [
  'marcar_incompleto',
  'poner_en_espera_cliente',
  'poner_en_espera_tecnica',
  'marcar_listo',
  'cerrar',
  'cancelar',
] as const;

export type AccionRfq = (typeof ACCIONES_RFQ)[number];

/** Secciones de la validación estructurada para LISTO (§3.6). */
export const SECCIONES_VALIDACION_RFQ = [
  'cliente',
  'general',
  'items',
  'archivos',
  'seguimiento',
] as const;

export type SeccionValidacionRfq = (typeof SECCIONES_VALIDACION_RFQ)[number];

/** Resultado de `validar_rfq_listo`: faltantes legibles por sección. */
export type ValidacionRfqListo = {
  listo: boolean;
  secciones: Record<SeccionValidacionRfq, string[]>;
};

/** Operación solicitada de un ítem contra `catalogo_procesos`. */
export type RfqItemOperacion = {
  procesoId: string;
  orden: number;
};

/** Ítem ITxx del RFQ. */
export type RfqItem = {
  id: string;
  rfqId: string;
  numero: number;
  codigo: string;
  descripcion: string;
  cantidad: number;
  materialId: string | null;
  espesorId: string | null;
  acabado: string | null;
  notas: string | null;
  estado: 'activo' | 'cancelado';
  creadoEn: string;
  actualizadoEn: string;
  /** Operaciones solicitadas (vacío si la consulta no las cargó). */
  operaciones: RfqItemOperacion[];
};

/** Cabecera RFQ (pipeline) con sus ítems. */
export type Rfq = {
  id: string;
  folio: string;
  folioOp: string;
  folioCnc: string | null;
  estadoRfq: EstadoRfq;
  /** Columna legacy sincronizada por el puente de transición (se retira en ola 2). */
  etapa: string;
  clienteId: string | null;
  condicionesPago: CondicionesPago | null;
  /** Nombre comercial del cliente ligado, o null si no hay `clienteId`. */
  clienteNombre: string | null;
  /** Fallback histórico de `pipeline.empresa` cuando no hay cliente ligado o no se resolvió. */
  empresa: string;
  contactoId: string | null;
  /** Nombre del contacto ligado, o null si no hay `contactoId`. */
  contactoNombre: string | null;
  /** Fallback histórico de `pipeline.nombre_contacto`. */
  nombreContacto: string;
  vendedorId: string;
  responsableId: string | null;
  /**
   * Nombre del responsable resuelto directo de `usuarios`, sin filtrar por
   * `activo` — un responsable histórico desactivado debe seguir siendo legible.
   */
  responsableNombre: string | null;
  canal: string | null;
  canalDetalle: string | null;
  fechaSolicitud: string | null;
  /** `pipeline.fecha_requerida` (legacy, timestamptz): fecha informativa del cliente, no la fecha compromiso comercial. */
  fechaRequeridaCliente: string | null;
  descripcionGeneral: string | null;
  proximaAccionCodigo: string | null;
  proximaAccionTexto: string | null;
  fechaProximaAccion: string | null;
  responsableProximaAccionId: string | null;
  /** Nombre del responsable de la próxima acción, resuelto sin filtrar por `activo`. */
  responsableProximaAccionNombre: string | null;
  actualizadoEn: string;
  items: RfqItem[];
};

/** Fila cruda de `pipeline` para la ficha RFQ (snake_case). */
export type FilaRfq = {
  id: string;
  folio_op: string;
  folio_cnc: string | null;
  folio_rfq: string | null;
  estado_rfq: string;
  etapa: string;
  cliente_id: string | null;
  condiciones_pago: CondicionesPago | null;
  empresa: string;
  contacto_id: string | null;
  nombre_contacto: string;
  vendedor_id: string;
  responsable_id: string | null;
  canal: string | null;
  canal_detalle: string | null;
  fecha_solicitud: string | null;
  fecha_requerida: string | null;
  descripcion_general: string | null;
  proxima_accion_codigo: string | null;
  proxima_accion_texto: string | null;
  fecha_proxima_accion: string | null;
  responsable_proxima_accion_id: string | null;
  actualizado_en: string;
};

/** Nombres resueltos fuera de la fila de `pipeline` (cliente, contacto, responsables). */
export type NombresResueltosRfq = {
  clienteNombre?: string | null;
  contactoNombre?: string | null;
  responsableNombre?: string | null;
  responsableProximaAccionNombre?: string | null;
};

/** Fila cruda de `rfq_items` (snake_case). */
export type FilaRfqItem = {
  id: string;
  rfq_id: string;
  numero: number;
  codigo: string;
  descripcion: string;
  cantidad: number;
  material_id: string | null;
  espesor_id: string | null;
  acabado: string | null;
  notas: string | null;
  estado: string;
  creado_en: string;
  actualizado_en: string;
};

/** Fila cruda de `rfq_item_operaciones` (snake_case). */
export type FilaRfqItemOperacion = {
  rfq_item_id: string;
  proceso_id: string;
  orden: number;
};

const ESTADOS_VALIDOS = new Set<string>(ESTADOS_RFQ);

/** Normaliza un estado venido de la BD; cualquier valor raro cae a INCOMPLETE. */
export function normalizarEstadoRfq(valor: string): EstadoRfq {
  return ESTADOS_VALIDOS.has(valor) ? (valor as EstadoRfq) : 'INCOMPLETE';
}

/**
 * Convierte la fila de `pipeline` al tipo de dominio. `folio` prefiere el folio
 * RFQ y cae al histórico `folio_op` (grandfathering ADR-09). `resueltos` trae
 * los nombres de cliente/contacto/responsables resueltos aparte (fuera de
 * `pipeline`); ausentes si no se consultaron.
 */
export function filaARfq(
  fila: FilaRfq,
  items: RfqItem[] = [],
  resueltos: NombresResueltosRfq = {},
): Rfq {
  return {
    id: fila.id,
    folio: fila.folio_rfq ?? fila.folio_op,
    folioOp: fila.folio_op,
    folioCnc: fila.folio_cnc,
    estadoRfq: normalizarEstadoRfq(fila.estado_rfq),
    etapa: fila.etapa,
    clienteId: fila.cliente_id,
    condicionesPago: fila.condiciones_pago,
    clienteNombre: resueltos.clienteNombre ?? null,
    empresa: fila.empresa,
    contactoId: fila.contacto_id,
    contactoNombre: resueltos.contactoNombre ?? null,
    nombreContacto: fila.nombre_contacto,
    vendedorId: fila.vendedor_id,
    responsableId: fila.responsable_id,
    responsableNombre: resueltos.responsableNombre ?? null,
    canal: fila.canal,
    canalDetalle: fila.canal_detalle,
    fechaSolicitud: fila.fecha_solicitud,
    fechaRequeridaCliente: fila.fecha_requerida,
    descripcionGeneral: fila.descripcion_general,
    proximaAccionCodigo: fila.proxima_accion_codigo,
    proximaAccionTexto: fila.proxima_accion_texto,
    fechaProximaAccion: fila.fecha_proxima_accion,
    responsableProximaAccionId: fila.responsable_proxima_accion_id,
    responsableProximaAccionNombre: resueltos.responsableProximaAccionNombre ?? null,
    actualizadoEn: fila.actualizado_en,
    items,
  };
}

/** Convierte la fila de `rfq_items` al tipo de dominio. */
export function filaARfqItem(
  fila: FilaRfqItem,
  operaciones: RfqItemOperacion[] = [],
): RfqItem {
  return {
    id: fila.id,
    rfqId: fila.rfq_id,
    numero: fila.numero,
    codigo: fila.codigo,
    descripcion: fila.descripcion,
    cantidad: fila.cantidad,
    materialId: fila.material_id,
    espesorId: fila.espesor_id,
    acabado: fila.acabado,
    notas: fila.notas,
    estado: fila.estado === 'cancelado' ? 'cancelado' : 'activo',
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
    operaciones,
  };
}

/** Causas de una versión registrada en `rfq_versiones` (C2.1/DC-04). */
export const CAUSAS_VERSION_RFQ = ['CABECERA', 'ITEM', 'CREAR_REV_A'] as const;

export type CausaVersionRfq = (typeof CAUSAS_VERSION_RFQ)[number];

/** Cabecera congelada de una versión (`snapshot_cabecera`). */
export type SnapshotCabeceraRfq = {
  folio: string | null;
  estadoRfq: EstadoRfq;
  clienteId: string | null;
  contactoId: string | null;
  empresa: string | null;
  nombreContacto: string | null;
  canal: string | null;
  canalDetalle: string | null;
  fechaSolicitud: string | null;
  fechaRequerida: string | null;
  descripcionGeneral: string | null;
  responsableId: string | null;
  moneda: string | null;
  actualizadoEn: string | null;
};

/** Ítem congelado de una versión (`snapshot_items`). */
export type SnapshotItemRfq = {
  id: string;
  codigo: string;
  numero: number;
  estado: string;
  descripcion: string;
  cantidad: number;
  materialId: string | null;
  espesorId: string | null;
  acabado: string | null;
  notas: string | null;
  operaciones: RfqItemOperacion[];
};

/** Versión del RFQ con actor resuelto; la pinta el Historial (solo lectura). */
export type VersionRfq = {
  id: string;
  numero: number;
  causa: CausaVersionRfq;
  actorId: string | null;
  actorNombre: string | null;
  creadoEn: string;
  cabecera: SnapshotCabeceraRfq;
  items: SnapshotItemRfq[];
};

const CAUSAS_VALIDAS_VERSION = new Set<string>(CAUSAS_VERSION_RFQ);

/** Etiqueta legible de la causa de una versión. */
export function etiquetaCausaVersion(causa: CausaVersionRfq): string {
  if (causa === 'ITEM') return 'Cambio de ítems';
  if (causa === 'CREAR_REV_A') return 'Versión final (Propuesta Rev A)';
  return 'Datos generales';
}

function textoOpcional(valor: unknown): string | null {
  return typeof valor === 'string' && valor.length > 0 ? valor : null;
}

function normalizarOperacionVersion(valor: unknown): RfqItemOperacion | null {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) return null;
  const fila = valor as Record<string, unknown>;
  if (typeof fila.proceso_id !== 'string') return null;
  return {
    procesoId: fila.proceso_id,
    orden: typeof fila.orden === 'number' ? fila.orden : 0,
  };
}

function normalizarItemVersion(valor: unknown): SnapshotItemRfq | null {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) return null;
  const fila = valor as Record<string, unknown>;
  if (typeof fila.id !== 'string' || typeof fila.codigo !== 'string') return null;
  const operaciones = Array.isArray(fila.operaciones)
    ? fila.operaciones
        .map(normalizarOperacionVersion)
        .filter((operacion): operacion is RfqItemOperacion => operacion !== null)
    : [];
  return {
    id: fila.id,
    codigo: fila.codigo,
    numero: typeof fila.numero === 'number' ? fila.numero : 0,
    estado: typeof fila.estado === 'string' ? fila.estado : 'activo',
    descripcion: typeof fila.descripcion === 'string' ? fila.descripcion : '',
    cantidad: typeof fila.cantidad === 'number' ? fila.cantidad : 0,
    materialId: textoOpcional(fila.material_id),
    espesorId: textoOpcional(fila.espesor_id),
    acabado: textoOpcional(fila.acabado),
    notas: textoOpcional(fila.notas),
    operaciones,
  };
}

function normalizarCabeceraVersion(valor: unknown): SnapshotCabeceraRfq {
  const fila =
    valor !== null && typeof valor === 'object' && !Array.isArray(valor)
      ? (valor as Record<string, unknown>)
      : {};
  return {
    folio: textoOpcional(fila.folio_rfq),
    estadoRfq: normalizarEstadoRfq(typeof fila.estado_rfq === 'string' ? fila.estado_rfq : ''),
    clienteId: textoOpcional(fila.cliente_id),
    contactoId: textoOpcional(fila.contacto_id),
    empresa: textoOpcional(fila.empresa),
    nombreContacto: textoOpcional(fila.nombre_contacto),
    canal: textoOpcional(fila.canal),
    canalDetalle: textoOpcional(fila.canal_detalle),
    fechaSolicitud: textoOpcional(fila.fecha_solicitud),
    fechaRequerida: textoOpcional(fila.fecha_requerida),
    descripcionGeneral: textoOpcional(fila.descripcion_general),
    responsableId: textoOpcional(fila.responsable_id),
    moneda: textoOpcional(fila.moneda),
    actualizadoEn: textoOpcional(fila.actualizado_en),
  };
}

/**
 * Normaliza una fila cruda de `rfq_versiones` (jsonb snake_case) al dominio.
 * Devuelve null si no tiene forma utilizable; nunca lanza.
 */
export function normalizarVersionRfq(valor: unknown, actorNombre: string | null = null): VersionRfq | null {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) return null;
  const fila = valor as Record<string, unknown>;
  if (typeof fila.id !== 'string' || typeof fila.numero !== 'number') return null;
  const causa = typeof fila.causa === 'string' && CAUSAS_VALIDAS_VERSION.has(fila.causa)
    ? (fila.causa as CausaVersionRfq)
    : null;
  if (!causa) return null;
  const items = Array.isArray(fila.snapshot_items)
    ? fila.snapshot_items
        .map(normalizarItemVersion)
        .filter((item): item is SnapshotItemRfq => item !== null)
    : [];
  return {
    id: fila.id,
    numero: fila.numero,
    causa,
    actorId: textoOpcional(fila.actor_id),
    actorNombre,
    creadoEn: typeof fila.creado_en === 'string' ? fila.creado_en : '',
    cabecera: normalizarCabeceraVersion(fila.snapshot_cabecera),
    items,
  };
}

/**
 * Mapea defensivamente el jsonb devuelto por las RPC de ítems (snake_case).
 * Devuelve null si el valor no tiene forma de ítem; nunca lanza.
 */
export function valorJsonAItemRfq(valor: unknown): RfqItem | null {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) {
    return null;
  }
  const fila = valor as Record<string, unknown>;
  if (typeof fila.id !== 'string' || typeof fila.codigo !== 'string') {
    return null;
  }
  return filaARfqItem({
    id: fila.id,
    rfq_id: typeof fila.rfq_id === 'string' ? fila.rfq_id : '',
    numero: typeof fila.numero === 'number' ? fila.numero : 0,
    codigo: fila.codigo,
    descripcion: typeof fila.descripcion === 'string' ? fila.descripcion : '',
    cantidad: typeof fila.cantidad === 'number' ? fila.cantidad : 0,
    material_id: typeof fila.material_id === 'string' ? fila.material_id : null,
    espesor_id: typeof fila.espesor_id === 'string' ? fila.espesor_id : null,
    acabado: typeof fila.acabado === 'string' ? fila.acabado : null,
    notas: typeof fila.notas === 'string' ? fila.notas : null,
    estado: typeof fila.estado === 'string' ? fila.estado : 'activo',
    creado_en: typeof fila.creado_en === 'string' ? fila.creado_en : '',
    actualizado_en: typeof fila.actualizado_en === 'string' ? fila.actualizado_en : '',
  });
}
