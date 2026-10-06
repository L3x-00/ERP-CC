/** Traduce los códigos del motor de tesorería a mensajes legibles. */
export function traducirErrorTesoreria(mensaje: string, detalle?: string): string {
  const codigo = mensaje.toLowerCase();
  if (codigo.includes('datos_saldo_inicial_invalidos')) return 'Revisa el saldo inicial (moneda y tipo de cambio de la cuenta)';
  if (codigo.includes('cuenta_inexistente')) return 'La cuenta no existe';
  if (codigo.includes('cuenta_origen_inexistente')) return 'La cuenta origen no existe';
  if (codigo.includes('cuenta_destino_inexistente')) return 'La cuenta destino no existe';
  if (codigo.includes('cuenta_inactiva')) return 'La cuenta está inactiva';
  if (codigo.includes('moneda_no_corresponde_cuenta')) return 'La moneda debe ser la de la cuenta';
  if (codigo.includes('tipo_cambio_mxn_invalido')) return 'Un monto en MXN exige tipo de cambio 1';
  if (codigo.includes('datos_transferencia_invalidos')) return 'Revisa los datos de la transferencia (cuentas distintas y monto positivo)';
  if (codigo.includes('monedas_distintas')) return 'La transferencia exige cuentas de la misma moneda';
  if (codigo.includes('datos_conciliacion_invalidos')) return 'Datos de conciliación inválidos';
  if (codigo.includes('movimiento_no_corresponde_cuenta')) return 'El movimiento no pertenece a esa cuenta';
  if (codigo.includes('movimiento_ya_conciliado')) return 'Ese movimiento ya está conciliado';
  if (codigo.includes('movimiento_no_conciliado')) return 'Ese movimiento no tiene marca de conciliación';
  return detalle
    ? `No se pudo completar la operación de tesorería (${detalle})`
    : 'No se pudo completar la operación de tesorería';
}
