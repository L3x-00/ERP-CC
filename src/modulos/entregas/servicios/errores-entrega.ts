/**
 * Traduce los errores tipados de las RPC/triggers de entregas a mensajes
 * legibles. Los códigos son estables (ver `20261007140001_sii_b7_entregas.sql`).
 */
export function traducirErrorEntrega(mensaje: string, detalle?: string): string {
  if (mensaje.includes('sin_permiso_entrega')) {
    return 'Sin permiso para generar entregas';
  }
  if (mensaje.includes('nota_entrega_invalida')) {
    return 'Los datos de la entrega no son válidos (receptor y renglones)';
  }
  if (mensaje.includes('partidas_entrega_invalidas')) {
    return 'Los renglones de la entrega no son válidos (cantidad > 0 y sin repetir partidas)';
  }
  if (mensaje.includes('partida_no_corresponde_orden')) {
    return 'Alguna partida no pertenece a la orden';
  }
  if (mensaje.includes('orden_no_encontrada')) {
    return 'La orden no existe';
  }
  if (mensaje.includes('orden_no_entregable')) {
    return `La orden no admite entregas en su estado actual${detalle ? ` (${detalle})` : ''}`;
  }
  if (mensaje.includes('cantidad_entrega_excede_producida')) {
    return 'No se puede entregar más de lo producido';
  }
  if (mensaje.includes('cantidad_entrega_excede_pendiente')) {
    return 'No se puede entregar más de lo pendiente por ítem';
  }
  if (mensaje.includes('entregador_no_activo')) {
    return 'El usuario que entrega no está activo';
  }
  if (mensaje.includes('contacto_invalido')) {
    return 'El contacto seleccionado no pertenece al cliente de la orden';
  }
  if (mensaje.includes('firma_evidencia_invalida') || mensaje.includes('clase_evidencia_invalida')) {
    return 'La evidencia o firma no es válida para la entrega';
  }
  console.error('[ENTREGAS] Error no traducido:', mensaje);
  return 'No se pudo completar la operación de entrega';
}
