/**
 * Etiqueta de una nota de entrega (QA 2026-11-15, M6).
 *
 * «Total» hacía pensar que la nota entregó todo el pedido. La decisión del PO
 * es nombrar la nota que completa la orden como «Final» y mostrar siempre qué
 * cantidad incluye frente al total solicitado de la orden: «Final · 80 de 200».
 */
export type EtiquetaNotaEntrega = {
  /** `final` cuando la nota completa la entrega de la orden. */
  tipo: 'parcial' | 'final';
  /** Texto listo para UI: «Final · 80 de 200» o «Parcial» si faltan cantidades. */
  texto: string;
};

function formatearCantidad(valor: number | null | undefined): string | null {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0) return null;
  return new Intl.NumberFormat('es-MX', { maximumFractionDigits: 3 }).format(valor);
}

/**
 * Construye la etiqueta de la nota con sus piezas y el total solicitado de la
 * orden. Si falta cualquiera de las dos cantidades, conserva solo el tipo.
 */
export function etiquetaNotaEntrega(entrada: {
  esParcial: boolean;
  piezas?: number | null;
  totalOrden?: number | null;
}): EtiquetaNotaEntrega {
  const tipo = entrada.esParcial ? 'parcial' : 'final';
  const piezas = formatearCantidad(entrada.piezas);
  const total = formatearCantidad(entrada.totalOrden);
  const detalle = piezas !== null && total !== null ? ` · ${piezas} de ${total}` : '';
  return {
    tipo,
    texto: `${tipo === 'final' ? 'Final' : 'Parcial'}${detalle}`,
  };
}
