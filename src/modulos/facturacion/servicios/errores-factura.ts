/** Traduce los códigos del motor de facturación (RPC) a mensajes legibles. */
export function traducirErrorFactura(mensaje: string, detalle?: string): string {
  const codigo = mensaje.toLowerCase();
  const sufijo = detalle ? ` (${detalle})` : '';
  if (codigo.includes('sin_permiso_factura')) return 'Sin permiso para facturar';
  if (codigo.includes('entrega_inexistente')) return 'La entrega no existe';
  if (codigo.includes('factura_inexistente')) return 'La factura no existe';
  if (codigo.includes('factura_no_editable')) return `Solo los borradores se editan${sufijo}`;
  if (codigo.includes('factura_no_emitible')) return `Solo los borradores se emiten${sufijo}`;
  if (codigo.includes('factura_desactualizada')) {
    return 'La factura cambió en otra sesión; recarga e inténtalo de nuevo';
  }
  if (codigo.includes('folio_fiscal_duplicado')) {
    return 'Ese folio fiscal ya está registrado en otra factura';
  }
  if (codigo.includes('cuenta_inexistente')) return 'La orden no tiene cuenta por cobrar';
  if (codigo.includes('cuenta_cancelada')) return 'La cuenta por cobrar está cancelada';
  if (codigo.includes('cuenta_ya_facturada')) {
    return 'La cuenta por cobrar ya está vinculada a otra factura';
  }
  if (codigo.includes('factura_ya_cancelada')) return 'La factura ya estaba cancelada';
  if (codigo.includes('datos_factura_invalidos')) return 'Datos de factura inválidos';
  if (codigo.includes('datos_cancelacion_invalidos')) {
    return 'Indica un motivo de cancelación (3 a 500 caracteres)';
  }
  return 'No se pudo completar la operación de facturación';
}
