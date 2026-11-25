/**
 * Subtotal a partir del precio unitario y la cantidad comprada.
 *
 * Es solo una ayuda de captura: el gasto se sigue enviando con el Subtotal que
 * tenga el formulario, que puede ajustarse si el comprobante incluye otros
 * conceptos. Devuelve null cuando no hay datos suficientes para calcularlo.
 */
export function subtotalDesdePrecio(precio: string, cantidad: string): string | null {
  const precioNumero = Number(precio);
  const cantidadNumero = Number(cantidad);
  if (
    precio.trim() === '' || cantidad.trim() === ''
    || !Number.isFinite(precioNumero) || !Number.isFinite(cantidadNumero)
    || precioNumero < 0 || cantidadNumero <= 0
  ) {
    return null;
  }
  return String(Math.round(precioNumero * cantidadNumero * 10_000) / 10_000);
}
