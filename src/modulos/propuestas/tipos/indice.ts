import type { Json, Tables } from '@/compartido/tipos/supabase';

/** Estados de la revisión y (espejo) de la propuesta (SII-B4.2). */
export const ESTADOS_PROPIESTA = [
  'DRAFT',
  'PENDING_APPROVAL',
  'READY_TO_SEND',
  'SENT',
  'FOLLOW_UP',
  'ACCEPTED',
  'PENDING_FINANCIAL',
  'SALE_CONFIRMED',
  'REJECTED',
  'CLOSED',
] as const;

export type EstadoPropuesta = (typeof ESTADOS_PROPIESTA)[number];

/** Categorías del costeo interno (SII-B4.5). */
export const CATEGORIAS_COSTO = [
  'material',
  'maquina',
  'mano_obra',
  'gastos_directos',
  'subcontratacion',
] as const;

export type CategoriaCosto = (typeof CATEGORIAS_COSTO)[number];

/** Moneda de la propuesta (heredada del RFQ). */
export type MonedaPropuesta = 'MXN' | 'USD';

/** Copia inmutable de la cabecera comercial al crear la revisión. */
export type SnapshotCabeceraPropuesta = {
  version: number;
  clienteId: string | null;
  cliente: {
    razonSocial: string | null;
    nombreComercial: string | null;
    rfc: string | null;
    correo: string | null;
    telefono: string | null;
  } | null;
  contactoId: string | null;
  contacto: {
    nombre: string | null;
    puesto: string | null;
    correo: string | null;
    telefono: string | null;
  } | null;
  empresa: string | null;
  moneda: MonedaPropuesta;
  condicionesPago: string | null;
  ivaPorcentaje: number;
  folioLegacy: string | null;
  folioRfq: string | null;
};

/** Propuesta comercial (cabecera). */
export type Propuesta = {
  id: string;
  rfqId: string;
  clienteId: string;
  folioCnc: string;
  estado: EstadoPropuesta;
  revisionVigenteId: string | null;
  acceptedRevisionId: string | null;
  responsableId: string;
  creadoPor: string;
  creadoEn: string;
  actualizadoEn: string;
};

/** Revisión A..Z de una propuesta. */
export type RevisionPropuesta = {
  id: string;
  propuestaId: string;
  letra: string;
  folioRevision: string;
  estado: EstadoPropuesta;
  motivoCreacion: string | null;
  snapshotCabecera: SnapshotCabeceraPropuesta;
  requiereRevisionRuteo: boolean;
  requiereRevisionCosteo: boolean;
  canalEnvio: string | null;
  destinoEnvio: string | null;
  enviadoEn: string | null;
  enviadoPor: string | null;
  validadaEn: string | null;
  validadaPor: string | null;
  creadoPor: string;
  creadoEn: string;
  actualizadoEn: string;
};

/** Ítem de la propuesta (ITxx estable heredado del RFQ). */
export type PropuestaItem = {
  id: string;
  revisionId: string;
  rfqItemId: string | null;
  codigo: string;
  descripcion: string;
  cantidad: number;
  materialId: string | null;
  espesorId: string | null;
  acabado: string | null;
  notas: string | null;
  precioUnitario: number;
  esDescuento: boolean;
  activo: boolean;
  creadoEn: string;
  actualizadoEn: string;
};

/** Fila del ruteo estimado por ítem. */
export type RuteoItemPropuesta = {
  id: string;
  itemId: string;
  secuencia: number;
  procesoId: string;
  grupoEquipoId: string | null;
  grupoPlaneadoId: string | null;
  setupHoras: number;
  runHoras: number;
  totalHoras: number;
  requiereRevision: boolean;
};

/** Fila del costeo interno por categoría. */
export type CostoRevisionPropuesta = {
  id: string;
  revisionId: string;
  categoria: CategoriaCosto;
  monto: number;
  nota: string | null;
};

/** Próxima acción registrada sobre una revisión. */
export type AccionRevisionPropuesta = {
  id: string;
  revisionId: string;
  codigo: string;
  textoOtro: string | null;
  fecha: string | null;
  responsableId: string | null;
  canal: string | null;
  nota: string | null;
  creadoPor: string;
  creadoEn: string;
};

/** Evento de transición de estado de una revisión. */
export type EventoRevisionPropuesta = {
  id: string;
  revisionId: string;
  estadoAnterior: EstadoPropuesta | null;
  estadoNuevo: EstadoPropuesta | null;
  accion: string;
  motivo: string | null;
  canal: string | null;
  destino: string | null;
  actorId: string | null;
  correlationId: string | null;
  creadoEn: string;
};

/** PDF versionado ligado a una revisión. */
export type PdfRevisionPropuesta = {
  id: string;
  revisionId: string;
  archivoId: string;
  contenidoHash: string;
  version: number;
  reemplazaA: string | null;
  vigente: boolean;
  generadoPor: string;
  creadoEn: string;
};

/** Totales y margen de una revisión (espejo de `calcular_totales_revision`). */
export type TotalesPropuesta = {
  bruto: number;
  descuento: number;
  subtotal: number;
  ivaPorcentaje: number;
  iva: number;
  total: number;
  costoTotal: number;
  /** `(subtotal − costoTotal) / subtotal` a 4 decimales; `null` si subtotal = 0. */
  margen: number | null;
  moneda: MonedaPropuesta;
};

/** Banderas de permiso resueltas en el servidor para la UI de propuestas. */
export type PermisosPropuesta = {
  editarArticulo: boolean;
  editarPrecio: boolean;
  editarRuteo: boolean;
  editarCosto: boolean;
  validar: boolean;
  generarPdf: boolean;
  enviar: boolean;
  seguimiento: boolean;
  aceptar: boolean;
  crearRevision: boolean;
  cerrar: boolean;
};

// Filas crudas de Supabase (snake_case) derivadas de los tipos generados.
export type FilaPropuesta = Tables<'propuestas'>;
export type FilaRevisionPropuesta = Tables<'propuesta_revisiones'>;
export type FilaItemPropuesta = Tables<'propuesta_items'>;
export type FilaRuteoPropuesta = Tables<'propuesta_item_ruteo'>;
export type FilaCostoRevisionPropuesta = Tables<'propuesta_revision_costos'>;
export type FilaAccionRevisionPropuesta = Tables<'propuesta_revision_acciones'>;
export type FilaEventoRevisionPropuesta = Tables<'propuesta_revision_eventos'>;
export type FilaPdfRevisionPropuesta = Tables<'propuesta_pdfs'>;

function esMoneda(valor: unknown): valor is MonedaPropuesta {
  return valor === 'USD';
}

function textoONull(valor: unknown): string | null {
  return typeof valor === 'string' ? valor : null;
}

function jsonNumero(valor: unknown, defecto: number): number {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : defecto;
}

/** Convierte el JSONB de cabecera a un snapshot tipado (defensivo). */
export function jsonASnapshotCabecera(valor: Json): SnapshotCabeceraPropuesta {
  const objeto =
    valor !== null && typeof valor === 'object' && !Array.isArray(valor)
      ? (valor as Record<string, unknown>)
      : {};
  const clienteCrudo =
    objeto.cliente !== null && typeof objeto.cliente === 'object' && !Array.isArray(objeto.cliente)
      ? (objeto.cliente as Record<string, unknown>)
      : null;
  const contactoCrudo =
    objeto.contacto !== null && typeof objeto.contacto === 'object' && !Array.isArray(objeto.contacto)
      ? (objeto.contacto as Record<string, unknown>)
      : null;

  return {
    version: jsonNumero(objeto.version, 1),
    clienteId: textoONull(objeto.cliente_id),
    cliente: clienteCrudo
      ? {
          razonSocial: textoONull(clienteCrudo.razon_social),
          nombreComercial: textoONull(clienteCrudo.nombre_comercial),
          rfc: textoONull(clienteCrudo.rfc),
          correo: textoONull(clienteCrudo.correo),
          telefono: textoONull(clienteCrudo.telefono),
        }
      : null,
    contactoId: textoONull(objeto.contacto_id),
    contacto: contactoCrudo
      ? {
          nombre: textoONull(contactoCrudo.nombre),
          puesto: textoONull(contactoCrudo.puesto),
          correo: textoONull(contactoCrudo.correo),
          telefono: textoONull(contactoCrudo.telefono),
        }
      : null,
    empresa: textoONull(objeto.empresa),
    moneda: esMoneda(objeto.moneda) ? 'USD' : 'MXN',
    condicionesPago: textoONull(objeto.condiciones_pago),
    ivaPorcentaje: jsonNumero(objeto.iva_porcentaje, 16),
    folioLegacy: textoONull(objeto.folio_legacy),
    folioRfq: textoONull(objeto.folio_rfq),
  };
}

/** Convierte una fila de `propuestas` (snake_case) a `Propuesta`. */
export function filaAPropuesta(fila: FilaPropuesta): Propuesta {
  return {
    id: fila.id,
    rfqId: fila.rfq_id,
    clienteId: fila.cliente_id,
    folioCnc: fila.folio_cnc,
    estado: fila.estado as EstadoPropuesta,
    revisionVigenteId: fila.revision_vigente_id,
    acceptedRevisionId: fila.accepted_revision_id,
    responsableId: fila.responsable_id,
    creadoPor: fila.creado_por,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}

/** Convierte una fila de `propuesta_revisiones` (snake_case) a `RevisionPropuesta`. */
export function filaARevisionPropuesta(fila: FilaRevisionPropuesta): RevisionPropuesta {
  return {
    id: fila.id,
    propuestaId: fila.propuesta_id,
    letra: fila.letra,
    folioRevision: fila.folio_revision,
    estado: fila.estado as EstadoPropuesta,
    motivoCreacion: fila.motivo_creacion,
    snapshotCabecera: jsonASnapshotCabecera(fila.snapshot_cabecera),
    requiereRevisionRuteo: fila.requiere_revision_ruteo,
    requiereRevisionCosteo: fila.requiere_revision_costeo,
    canalEnvio: fila.canal_envio,
    destinoEnvio: fila.destino_envio,
    enviadoEn: fila.enviado_en,
    enviadoPor: fila.enviado_por,
    validadaEn: fila.validada_en,
    validadaPor: fila.validada_por,
    creadoPor: fila.creado_por,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}

/** Convierte una fila de `propuesta_items` (snake_case) a `PropuestaItem`. */
export function filaAItemPropuesta(fila: FilaItemPropuesta): PropuestaItem {
  return {
    id: fila.id,
    revisionId: fila.revision_id,
    rfqItemId: fila.rfq_item_id,
    codigo: fila.codigo,
    descripcion: fila.descripcion,
    cantidad: Number(fila.cantidad),
    materialId: fila.material_id,
    espesorId: fila.espesor_id,
    acabado: fila.acabado,
    notas: fila.notas,
    precioUnitario: Number(fila.precio_unitario),
    esDescuento: fila.es_descuento,
    activo: fila.activo,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}

/** Convierte una fila de `propuesta_item_ruteo` (snake_case). */
export function filaARuteoPropuesta(fila: FilaRuteoPropuesta): RuteoItemPropuesta {
  return {
    id: fila.id,
    itemId: fila.item_id,
    secuencia: fila.secuencia,
    procesoId: fila.proceso_id,
    grupoEquipoId: fila.grupo_equipo_id,
    grupoPlaneadoId: fila.grupo_planeado_id,
    setupHoras: Number(fila.setup_horas),
    runHoras: Number(fila.run_horas),
    totalHoras: Number(fila.total_horas ?? Number(fila.setup_horas) + Number(fila.run_horas)),
    requiereRevision: fila.requiere_revision,
  };
}

/** Convierte una fila de `propuesta_revision_costos` (snake_case). */
export function filaACostoRevisionPropuesta(
  fila: FilaCostoRevisionPropuesta,
): CostoRevisionPropuesta {
  return {
    id: fila.id,
    revisionId: fila.revision_id,
    categoria: fila.categoria as CategoriaCosto,
    monto: Number(fila.monto),
    nota: fila.nota,
  };
}

/** Convierte una fila de `propuesta_revision_acciones` (snake_case). */
export function filaAAccionRevisionPropuesta(
  fila: FilaAccionRevisionPropuesta,
): AccionRevisionPropuesta {
  return {
    id: fila.id,
    revisionId: fila.revision_id,
    codigo: fila.codigo,
    textoOtro: fila.texto_otro,
    fecha: fila.fecha,
    responsableId: fila.responsable_id,
    canal: fila.canal,
    nota: fila.nota,
    creadoPor: fila.creado_por,
    creadoEn: fila.creado_en,
  };
}

/** Convierte una fila de `propuesta_revision_eventos` (snake_case). */
export function filaAEventoRevisionPropuesta(
  fila: FilaEventoRevisionPropuesta,
): EventoRevisionPropuesta {
  return {
    id: fila.id,
    revisionId: fila.revision_id,
    estadoAnterior: fila.estado_anterior as EstadoPropuesta | null,
    estadoNuevo: fila.estado_nuevo as EstadoPropuesta | null,
    accion: fila.accion,
    motivo: fila.motivo,
    canal: fila.canal,
    destino: fila.destino,
    actorId: fila.actor_id,
    correlationId: fila.correlation_id,
    creadoEn: fila.creado_en,
  };
}

/** Convierte una fila de `propuesta_pdfs` (snake_case). */
export function filaAPdfRevisionPropuesta(fila: FilaPdfRevisionPropuesta): PdfRevisionPropuesta {
  return {
    id: fila.id,
    revisionId: fila.revision_id,
    archivoId: fila.archivo_id,
    contenidoHash: fila.contenido_hash,
    version: fila.version,
    reemplazaA: fila.reemplaza_a,
    vigente: fila.vigente,
    generadoPor: fila.generado_por,
    creadoEn: fila.creado_en,
  };
}
