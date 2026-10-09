/** Mensajes públicos de los gates al crear una Orden desde una revisión aceptada. */
export const MENSAJES_ORDEN: Readonly<Record<string, string>> = {
  revision_no_aceptada: 'La orden solo nace de la revisión aceptada vigente.',
  revision_inexistente: 'La revisión ya no existe.',
  cliente_no_activo: 'El cliente de la propuesta no está activo.',
  credito_limite_excedido: 'El cliente excede su límite de crédito; requiere autorización de un administrador.',
  tipo_cambio_usd_requerido: 'Configura el tipo de cambio USD antes de confirmar una venta en dólares.',
  propuesta_sin_items_fabricables: 'La revisión no tiene ítems fabricables.',
  sin_permiso_orden: 'No tienes permiso para crear órdenes.',
  cliente_no_corresponde_orden: 'El cliente no corresponde a la orden existente.',
};

/** Causa legible de una «Orden pendiente» a partir del código del gate (C4.1). */
export function mensajeCausaOrden(codigo: string | null): string {
  if (!codigo) return 'La orden aún no se ha procesado.';
  const clave = Object.keys(MENSAJES_ORDEN).find((conocido) => codigo.includes(conocido));
  return clave ? MENSAJES_ORDEN[clave]! : 'La orden no se pudo crear; revisa los datos de la propuesta y reintenta.';
}
