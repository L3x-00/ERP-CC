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
  if (mensaje.includes('entrega_inexistente')) {
    return 'La entrega ya no existe';
  }
  if (mensaje.includes('entrega_desactualizada')) {
    return 'La entrega cambió; recarga antes de editarla';
  }
  if (mensaje.includes('fecha_entrega_invalida')) {
    return 'La fecha no puede ser anterior al día de generación de la nota';
  }
  if (mensaje.includes('fecha_entrega_futura')) {
    return 'La fecha de entrega no puede ser futura';
  }
  if (mensaje.includes('datos_fecha_entrega_invalidos')) {
    return 'La fecha de entrega no es válida';
  }
  if (mensaje.includes('sin_permiso_anulacion')) {
    return 'Solo un administrador puede anular una nota de entrega';
  }
  if (mensaje.includes('motivo_anulacion_requerido')) {
    return 'Indica el motivo de la anulación (entre 3 y 500 caracteres)';
  }
  if (mensaje.includes('nota_inexistente')) {
    return 'La nota de entrega no existe';
  }
  if (mensaje.includes('nota_con_cuenta_por_cobrar')) {
    return 'La nota tiene movimientos de cobranza asociados. '
      + 'No se puede anular sin revertir o reasignar esos movimientos con Finanzas.';
  }
  if (mensaje.includes('nota_sustituta_invalida')) {
    return 'La nota sustituta debe pertenecer a la misma orden y ser distinta';
  }
  if (mensaje.includes('solicitud_anulacion_conflicto')) {
    return 'La solicitud de anulación ya se usó para otra nota';
  }
  console.error('[ENTREGAS] Error no traducido:', mensaje);
  return 'No se pudo completar la operación de entrega';
}
