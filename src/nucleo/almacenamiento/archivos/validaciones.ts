/** Entidades del modelo único de archivos (debe coincidir con el CHECK de `archivos`). */
export const ENTIDADES_ARCHIVO = [
  'cliente',
  'rfq',
  'rfq_item',
  'propuesta',
  'propuesta_revision',
  'propuesta_item',
  'orden',
  'sesion_produccion',
  'entrega',
  'gasto',
  'inspeccion_calidad',
] as const;

export type EntidadArchivo = (typeof ENTIDADES_ARCHIVO)[number];

/** Perfil de subida por entidad: tamaño máximo y extensiones permitidas. */
export type PerfilSubida = {
  maxBytes: number;
  extensiones: ReadonlySet<string>;
};

const MB = 1024 * 1024;

const IMAGEN_Y_PDF = ['pdf', 'jpg', 'jpeg', 'png', 'webp'] as const;
const TECNICOS = [
  'pdf', 'dxf', 'dwg', 'step', 'stp', 'igs', 'iges', 'eps', 'ai',
  'png', 'jpg', 'jpeg', 'webp',
  'xlsx', 'xls', 'csv', 'doc', 'docx',
] as const;

/** Perfiles alineados a los buckets y a los flujos del documento del cliente. */
export const PERFILES_ARCHIVO: Record<EntidadArchivo, PerfilSubida> = {
  cliente: { maxBytes: 10 * MB, extensiones: new Set(['pdf', 'jpg', 'jpeg', 'png']) },
  rfq: { maxBytes: 20 * MB, extensiones: new Set(TECNICOS) },
  rfq_item: { maxBytes: 20 * MB, extensiones: new Set(TECNICOS) },
  propuesta: { maxBytes: 20 * MB, extensiones: new Set(TECNICOS) },
  propuesta_revision: { maxBytes: 20 * MB, extensiones: new Set(TECNICOS) },
  propuesta_item: { maxBytes: 20 * MB, extensiones: new Set(TECNICOS) },
  orden: { maxBytes: 20 * MB, extensiones: new Set(TECNICOS) },
  sesion_produccion: { maxBytes: 20 * MB, extensiones: new Set(TECNICOS) },
  entrega: { maxBytes: 10 * MB, extensiones: new Set(IMAGEN_Y_PDF) },
  gasto: { maxBytes: 10 * MB, extensiones: new Set([...IMAGEN_Y_PDF, 'gif']) },
  inspeccion_calidad: { maxBytes: 10 * MB, extensiones: new Set(IMAGEN_Y_PDF) },
};

/** Sanea un nombre de archivo: quita rutas y caracteres peligrosos, conserva extensión. */
export function sanearNombreArchivo(nombre: string): string {
  const base = nombre.split(/[\\/]/).pop() ?? 'archivo';
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'archivo';
}

/** Extensión en minúsculas sin punto; cadena vacía si no tiene. */
export function extensionDe(nombre: string): string {
  const punto = nombre.lastIndexOf('.');
  if (punto < 0 || punto === nombre.length - 1) return '';
  return nombre.slice(punto + 1).toLowerCase();
}

export type ResultadoValidacion = { ok: true } | { ok: false; error: string };

/**
 * Valida tamaño y extensión de una subida según la entidad.
 * El MIME declarado no se confía: la extensión y los límites del bucket mandan
 * (los formatos CAD llegan como `application/octet-stream`).
 */
export function validarSubidaArchivo(
  entidad: EntidadArchivo,
  archivo: { nombre: string; tamano: number },
): ResultadoValidacion {
  const perfil = PERFILES_ARCHIVO[entidad];
  if (!perfil) {
    return { ok: false, error: 'Entidad de archivo desconocida' };
  }
  if (!Number.isFinite(archivo.tamano) || archivo.tamano <= 0) {
    return { ok: false, error: 'El archivo está vacío' };
  }
  if (archivo.tamano > perfil.maxBytes) {
    return {
      ok: false,
      error: `El archivo excede el tamaño máximo (${Math.floor(perfil.maxBytes / MB)} MB)`,
    };
  }
  const extension = extensionDe(archivo.nombre);
  if (!perfil.extensiones.has(extension)) {
    return { ok: false, error: 'Tipo de archivo no permitido' };
  }
  return { ok: true };
}
