/** Estados SII de la orden (ADR-SII-07): se derivan del avance, nunca a mano. */
export const ESTADOS_SII_ORDEN = [
  'CONFIRMADA',
  'PLANIFICADA',
  'LISTA',
  'EN_PRODUCCION',
  'PRODUCCION_COMPLETADA',
  'CERRADA',
  'CANCELADA',
] as const;
export type EstadoSiiOrden = (typeof ESTADOS_SII_ORDEN)[number];

/** Estados legacy mientras conviven ambos modelos (puente de la ola 1). */
export const ESTADOS_LEGACY_ORDEN = [
  'borrador',
  'programada',
  'en_proceso',
  'pausada',
  'completada',
  'cancelada',
] as const;
export type EstadoLegacyOrden = (typeof ESTADOS_LEGACY_ORDEN)[number];

/** Espejo TS del puente SQL `privado.sincronizar_estado_orden_sii`. */
export const ESTADO_SII_A_LEGACY: Record<EstadoSiiOrden, EstadoLegacyOrden> = {
  CONFIRMADA: 'borrador',
  PLANIFICADA: 'programada',
  LISTA: 'programada',
  EN_PRODUCCION: 'en_proceso',
  PRODUCCION_COMPLETADA: 'completada',
  CERRADA: 'completada',
  CANCELADA: 'cancelada',
};

export const ESTADO_LEGACY_A_SII: Record<EstadoLegacyOrden, EstadoSiiOrden> = {
  borrador: 'CONFIRMADA',
  programada: 'PLANIFICADA',
  en_proceso: 'EN_PRODUCCION',
  pausada: 'EN_PRODUCCION',
  completada: 'PRODUCCION_COMPLETADA',
  cancelada: 'CANCELADA',
};

export interface OrdenSiiCreada {
  id: string;
  folio: string;
  folioSii: string;
  yaExistia: boolean;
}

export interface OrdenSiiEstadoActualizado {
  id: string;
  estadoSii: EstadoSiiOrden;
  actualizadoEn: string;
}

export interface OrdenSiiCerrada {
  id: string;
  estadoSii: EstadoSiiOrden;
  cerradaAdminEn: string | null;
}

export interface ArchivoSnapshotOrden {
  archivo_id: string;
  clase?: string | null;
  tema_codigo?: string | null;
  nombre_original?: string | null;
  nombre_erp?: string | null;
  mime?: string | null;
}

export interface ItemSnapshotOrden {
  item_id?: string | null;
  codigo?: string | null;
  codigo_item?: string | null;
  descripcion?: string | null;
  cantidad?: number | null;
  precio_unitario?: number | null;
  es_descuento?: boolean | null;
  material?: string | null;
  espesor?: string | null;
  acabado?: string | null;
  notas?: string | null;
  operaciones?: unknown[];
  ruteo?: unknown[];
  archivos?: ArchivoSnapshotOrden[];
}

export interface SnapshotOrdenSii {
  version: number;
  orden_id: string;
  origen: Record<string, unknown>;
  cabecera: Record<string, unknown>;
  items: ItemSnapshotOrden[];
  archivos: ArchivoSnapshotOrden[];
  es_interna?: boolean;
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function esArchivoSnapshot(valor: unknown): valor is ArchivoSnapshotOrden {
  return esObjeto(valor)
    && typeof valor.archivo_id === 'string'
    && valor.archivo_id.length > 0;
}

/** Guard defensivo para leer `snapshot_json` sin confiar en su forma. */
export function esSnapshotOrdenSii(valor: unknown): valor is SnapshotOrdenSii {
  if (!esObjeto(valor)) return false;
  if (typeof valor.version !== 'number') return false;
  if (typeof valor.orden_id !== 'string') return false;
  if (!esObjeto(valor.origen) || !esObjeto(valor.cabecera)) return false;
  if (!Array.isArray(valor.items) || !Array.isArray(valor.archivos)) return false;
  if (!valor.archivos.every((archivo) => esArchivoSnapshot(archivo))) return false;
  return valor.items.every(
    (item) => esObjeto(item)
      && (item.archivos === undefined || Array.isArray(item.archivos))
      && (item.archivos === undefined || item.archivos.every((archivo) => esArchivoSnapshot(archivo))),
  );
}

/** Extrae los IDs exactos —vigentes o históricos— referenciados por un snapshot. */
export function archivosReferenciados(snapshot: SnapshotOrdenSii): string[] {
  const ids = new Set<string>();
  for (const archivo of snapshot.archivos) {
    if (archivo?.archivo_id) ids.add(archivo.archivo_id);
  }
  for (const item of snapshot.items) {
    for (const archivo of item.archivos ?? []) {
      if (archivo?.archivo_id) ids.add(archivo.archivo_id);
    }
  }
  return [...ids];
}
