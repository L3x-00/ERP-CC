/**
 * Etiquetas de material para selects y listas.
 *
 * El código va primero a propósito: en un `<select>` nativo el navegador
 * recorta el final del texto cuando no cabe, y lo que nunca debe perderse es
 * la clave (`CRS-14`) que el taller usa para identificar el material. El
 * nombre completo y la unidad quedan en el `title` de la opción.
 */

/** Etiqueta compacta: `CRS-14 · Acero al carbón calibre 14`. */
export function etiquetaMaterial(codigo: string, nombre: string): string {
  const clave = codigo.trim();
  const descripcion = nombre.trim();
  if (!clave) return descripcion;
  if (!descripcion) return clave;
  return `${clave} · ${descripcion}`;
}

/** Etiqueta completa: `CRS-14 · Acero al carbón calibre 14 · m2`. */
export function detalleMaterial(
  codigo: string,
  nombre: string,
  unidad: string | null | undefined,
): string {
  const base = etiquetaMaterial(codigo, nombre);
  const unidadLimpia = unidad?.trim();
  return unidadLimpia ? `${base} · ${unidadLimpia}` : base;
}
