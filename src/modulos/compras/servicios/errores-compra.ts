/** Traduce los códigos del motor de compras a mensajes legibles. */
export function traducirErrorCompra(mensaje: string, detalle?: string): string {
  const codigo = mensaje.toLowerCase();
  if (codigo.includes('datos_compra_invalidos')) return 'Revisa los datos de la compra';
  if (codigo.includes('proveedor_inexistente')) return 'El proveedor no existe';
  if (codigo.includes('orden_inexistente')) return 'La orden vinculada no existe';
  if (codigo.includes('compra_inexistente')) return 'La compra no existe';
  if (codigo.includes('compra_no_editable')) return `Solo los borradores se editan${detalle ? ` (${detalle})` : ''}`;
  if (codigo.includes('compra_no_pagable')) return `La compra no admite pagos en su estado${detalle ? ` (${detalle})` : ''}`;
  if (codigo.includes('compra_desactualizada')) return 'La compra cambió en otra sesión; recarga e inténtalo de nuevo';
  if (codigo.includes('transicion_compra_invalida')) return `Transición no permitida${detalle ? ` desde ${detalle}` : ''}`;
  if (codigo.includes('motivo_cancelacion_invalido')) return 'Indica un motivo de cancelación (3 a 300 caracteres)';
  if (codigo.includes('compra_con_pagos')) return 'No se cancela una compra con pagos registrados';
  if (codigo.includes('monto_excede_saldo')) return 'El pago excede el saldo pendiente';
  if (codigo.includes('cuenta_bancaria_no_disponible')) return 'La cuenta bancaria no está disponible para esa moneda';
  if (codigo.includes('datos_pago_compra_invalidos')) return 'Revisa los datos del pago';
  return 'No se pudo completar la operación de compras';
}
