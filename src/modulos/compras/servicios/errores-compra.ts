/** Traduce los códigos del motor de compras a mensajes legibles. */
export function traducirErrorCompra(mensaje: string, detalle?: string): string {
  const codigo = mensaje.toLowerCase();
  if (codigo.includes('datos_compra_invalidos')) return 'Revisa los datos de la compra';
  if (codigo.includes('proveedor_inexistente')) return 'El proveedor no existe';
  if (codigo.includes('orden_inexistente')) return 'La orden vinculada no existe';
  if (codigo.includes('compra_inexistente')) return 'La compra no existe';
  if (codigo.includes('compra_no_encontrada')) return 'La compra no existe';
  if (codigo.includes('rubro_costo_requerido')) return 'Con Orden, el rubro de costo es obligatorio';
  if (codigo.includes('rubro_costo_invalido')) return 'Selecciona un rubro de costo válido';
  if (codigo.includes('subtotal_material_incoherente')) return 'El subtotal debe cuadrar con cantidad × costo unitario (±0.01)';
  if (codigo.includes('cantidad_compra_invalida')) return 'La cantidad debe ser mayor a 0';
  if (codigo.includes('costo_unitario_compra_invalido')) return 'El costo unitario no puede ser negativo';
  if (codigo.includes('material_inexistente')) return 'El material del catálogo no existe';
  if (codigo.includes('compra_sin_orden')) return 'Solo una compra con Orden puede clasificarse por rubro';
  if (codigo.includes('compra_cancelada')) return 'Una compra cancelada no se puede clasificar';
  if (codigo.includes('rubro_ya_asignado')) return 'La compra ya tiene un rubro asignado; recarga para ver el valor actual';
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
