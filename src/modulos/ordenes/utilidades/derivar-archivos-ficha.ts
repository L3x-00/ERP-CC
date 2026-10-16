import type { ArchivoFicha } from '@/modulos/ordenes/tipos/ficha-orden';
import type { ArchivoSnapshotOrden, SnapshotOrdenSii } from '@/modulos/ordenes/tipos/orden-sii';

/** Fila de `archivos` con lo mínimo para derivar la tabla de la ficha (sin ruta ni bucket). */
export interface FilaArchivoFicha {
  id: string;
  entidad: string;
  entidad_id: string;
  clase: string | null;
  nombre_original: string | null;
  nombre_erp: string | null;
  vigente: boolean;
  retirado_en: string | null;
}

/** Ítem de la propuesta aceptada: une un ítem del RFQ con su ITxx. */
export interface VinculoItemFicha {
  rfq_item_id: string | null;
  codigo: string;
}

const SIN_DATO = '-';
const GENERAL = '(general)';

// `archivos.clase` es texto libre sin catálogo único (enum del RFQ en mayúsculas, `tecnico` de
// Propuestas, `pdf` del PDF generado). Solo se traduce lo conocido; nunca se infiere por extensión.
const TIPO_POR_CLASE = new Map<string, string>([
  ['CAD', 'CAD'],
  ['DIBUJO', 'Plano'],
  ['IMAGEN', 'Imagen'],
  ['ESPECIFICACIONES', 'Especificaciones'],
  ['OTROS', 'Otro'],
  ['TECNICO', 'Técnico'],
  ['TÉCNICO', 'Técnico'],
]);

function texto(valor: string | null | undefined): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null;
}

function tipoDeClase(clase: string | null): string {
  const clave = texto(clase)?.toUpperCase();
  return (clave ? TIPO_POR_CLASE.get(clave) : undefined) ?? SIN_DATO;
}

function origenDeEntidad(entidad: string | null, letra: string | null): string {
  switch (entidad) {
    case 'rfq':
    case 'rfq_item':
      return 'RFQ';
    case 'propuesta_revision':
    case 'propuesta_item':
      return letra ? `Propuesta Rev ${letra}` : 'Propuesta';
    case 'propuesta':
      return 'Propuesta';
    case 'orden':
      return 'Orden';
    default:
      return SIN_DATO;
  }
}

interface ReferenciaSnapshot {
  meta: ArchivoSnapshotOrden;
  /** ITxx del ítem del snapshot que contiene al archivo; null si cuelga de la cabecera. */
  codigoContenedor: string | null;
}

/** Referencias del snapshot sin repetir ids; la cabecera va primero y luego los ítems en orden. */
function referenciasDelSnapshot(snapshot: SnapshotOrdenSii): Map<string, ReferenciaSnapshot> {
  const referencias = new Map<string, ReferenciaSnapshot>();
  const registrar = (meta: ArchivoSnapshotOrden, codigoContenedor: string | null): void => {
    const existente = referencias.get(meta.archivo_id);
    if (!existente) {
      referencias.set(meta.archivo_id, { meta, codigoContenedor });
    } else if (existente.codigoContenedor === null && codigoContenedor !== null) {
      existente.codigoContenedor = codigoContenedor;
    }
  };
  for (const archivo of snapshot.archivos) registrar(archivo, null);
  for (const item of snapshot.items) {
    const codigo = texto(item.codigo) ?? texto(item.codigo_item);
    for (const archivo of item.archivos ?? []) registrar(archivo, codigo);
  }
  return referencias;
}

/**
 * Tabla Archivo | Origen | Asociado a | Tipo de la ficha (R09), derivada en lectura de los ids
 * congelados en el snapshot y de la fila viva de `archivos`. La fila manda sobre los metadatos del
 * snapshot; un id sin fila se conserva como no disponible, y un archivo retirado o que ya no es
 * vigente se omite. No reutiliza la vista documental de Producción (esa pierde el ITxx de las
 * revisiones previas y sigue listando lo retirado).
 */
export function derivarArchivosFicha(
  snapshot: SnapshotOrdenSii | null,
  filas: readonly FilaArchivoFicha[],
  vinculosItems: readonly VinculoItemFicha[],
): ArchivoFicha[] {
  if (!snapshot) return [];
  const filaPorId = new Map(filas.map((fila) => [fila.id, fila]));
  const codigoPorItemRfq = new Map(
    vinculosItems.flatMap((vinculo) => vinculo.rfq_item_id ? [[vinculo.rfq_item_id, vinculo.codigo] as const] : []),
  );

  const archivos: ArchivoFicha[] = [];
  for (const [id, { meta, codigoContenedor }] of referenciasDelSnapshot(snapshot)) {
    const fila = filaPorId.get(id);
    if (fila && (fila.retirado_en !== null || !fila.vigente)) continue;

    const entidad = fila?.entidad ?? texto(meta.entidad);
    const codigoRfq = fila?.entidad === 'rfq_item' ? codigoPorItemRfq.get(fila.entidad_id) : undefined;
    archivos.push({
      archivoId: id,
      nombreOriginal: fila ? texto(fila.nombre_original) : texto(meta.nombre_original),
      nombreErp: fila ? texto(fila.nombre_erp) : texto(meta.nombre_erp),
      origen: origenDeEntidad(entidad, texto(meta.revision_letra)),
      asociadoA: codigoContenedor ?? codigoRfq ?? GENERAL,
      tipo: tipoDeClase(fila ? fila.clase ?? meta.clase ?? null : meta.clase ?? null),
      disponible: fila !== undefined,
    });
  }
  return archivos;
}
