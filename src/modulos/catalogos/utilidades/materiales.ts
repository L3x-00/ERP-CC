/**
 * Un material del catálogo es seleccionable como material de un ítem vendible
 * (RFQ o propuesta) cuando no está marcado como consumible/insumo. La categoría
 * vive en `metadata.categoria`; las filas sin categoría se conservan para no
 * ocultar los materiales base ni los capturados antes de existir la marca.
 */
export function esMaterialVendible(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return true;
  const categoria = (metadata as { categoria?: unknown }).categoria;
  if (typeof categoria !== 'string') return true;
  return categoria.trim().toLowerCase() !== 'insumo';
}
