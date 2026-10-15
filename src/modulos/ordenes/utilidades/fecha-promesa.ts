/**
 * Promesa original al cliente (O-06 A): el compromiso comercial. `fechaCompromiso` es un espejo de
 * la fecha operativa que Planeación puede reprogramar, así que solo sirve de respaldo para las
 * órdenes sin compromiso comercial (internas o anteriores al flujo SII). Devuelve YYYY-MM-DD.
 */
export function fechaPromesaOrden(orden: {
  fechaCompromiso: string;
  fechaCompromisoComercial?: string | null;
}): string {
  const comercial = orden.fechaCompromisoComercial;
  const base = comercial !== null && comercial !== undefined && comercial.trim() !== ''
    ? comercial
    : orden.fechaCompromiso;
  return base.slice(0, 10);
}
