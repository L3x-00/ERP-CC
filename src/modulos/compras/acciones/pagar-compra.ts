'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { traducirErrorCompra } from '@/modulos/compras/servicios/errores-compra';
import { esquemaPagarCompra } from '@/modulos/compras/validaciones/esquemas-compras';

export type ResultadoPagarCompra = {
  pagoId: string;
  estado: string;
  saldoPendiente: number;
  actualizadoEn: string;
};

/** SII-B8 F4: registra un pago (parcial/total) de la compra. */
export async function pagarCompraAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoPagarCompra>> {
  const analisis = esquemaPagarCompra.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const datos = analisis.data;

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'registrar_pagos'))) {
    return { exito: false, error: 'Sin permiso para registrar pagos' };
  }

  const correlationId = nuevoCorrelationId();
  const admin = crearClienteSupabaseAdmin();
  const { data, error } = await admin.rpc('pagar_compra', {
    p_compra_id: datos.compraId,
    p_monto: datos.monto,
    p_metodo_pago: datos.metodoPago,
    p_referencia: datos.referencia ?? null,
    p_cuenta_bancaria_id: datos.cuentaBancariaId ?? null,
    p_notas: datos.notas ?? null,
    p_actor_id: usuario.id,
    p_correlation_id: correlationId,
  });

  const fila = Array.isArray(data) ? data[0] : null;
  if (error || !fila) {
    await registrarLog(
      usuario,
      'pagar_compra_rechazado',
      'compras',
      datos.compraId,
      { codigo: (error?.message ?? 'sin_respuesta').slice(0, 120) },
      correlationId,
    );
    return { exito: false, error: traducirErrorCompra(error?.message ?? '', error?.details ?? undefined) };
  }

  await registrarLog(
    usuario,
    'pagar_compra',
    'compras',
    datos.compraId,
    { pagoId: fila.pago_id, monto: datos.monto, estado: fila.estado },
    correlationId,
  );

  return {
    exito: true,
    datos: {
      pagoId: fila.pago_id,
      estado: fila.estado,
      saldoPendiente: Number(fila.saldo_pendiente),
      actualizadoEn: fila.actualizado_en,
    },
  };
}
