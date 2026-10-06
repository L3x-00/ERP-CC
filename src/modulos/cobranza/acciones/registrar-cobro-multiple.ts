'use server';

import { randomUUID } from 'node:crypto';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import type { Json } from '@/compartido/tipos/supabase';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { mensajeErrorCobranza } from '@/modulos/cobranza/servicios/cobranza-servicio';
import { esquemaCobroMultiple } from '@/modulos/cobranza/validaciones/promesas';

export type ResultadoCobroMultiple = {
  pagoId: string;
  folioRecibo: string;
  aplicaciones: number;
  saldoAFavorMxn: number;
  solicitudId: string;
};

/** SII-B8 F3: registra un recibo repartido entre varias facturas del cliente. */
export async function registrarCobroMultipleAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoCobroMultiple>> {
  const analisis = esquemaCobroMultiple.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const datos = analisis.data;

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'registrar_pagos'))) {
    return { exito: false, error: 'Sin permiso para registrar pagos' };
  }

  const solicitudId = datos.solicitudId ?? randomUUID();
  const correlationId = nuevoCorrelationId();
  const admin = crearClienteSupabaseAdmin();

  const aplicaciones = datos.aplicaciones.map((aplicacion) => ({
    cuenta_id: aplicacion.cuentaId,
    monto: aplicacion.monto,
  }));

  const { data, error } = await admin.rpc('registrar_cobro_multiple', {
    p_cliente_id: datos.clienteId,
    p_monto_pagado: datos.montoPagado,
    p_moneda_pago: datos.monedaPago,
    p_tipo_cambio_pago: datos.tipoCambio,
    p_metodo_pago: datos.metodoPago,
    p_referencia: datos.referencia ?? null,
    p_cuenta_bancaria_id: datos.cuentaBancariaId ?? null,
    p_notas: datos.notas ?? null,
    p_aplicaciones: aplicaciones as unknown as Json,
    p_usuario_id: usuario.id,
    p_solicitud_id: solicitudId,
    p_correlation_id: correlationId,
  });

  const fila = Array.isArray(data) ? data[0] : null;
  if (error || !fila) {
    console.error('[COBRANZA] Cobro múltiple rechazado:', error?.message);
    await registrarLog(
      usuario,
      'registrar_cobro_multiple_rechazado',
      'cobranza',
      datos.clienteId,
      { codigo: (error?.message ?? 'sin_respuesta').slice(0, 120) },
      correlationId,
    );
    return { exito: false, error: mensajeErrorCobranza(error ?? new Error('sin_respuesta')) };
  }

  await registrarLog(
    usuario,
    'registrar_cobro_multiple',
    'cobranza',
    fila.pago_id,
    {
      folio: fila.folio_recibo,
      aplicaciones: fila.aplicaciones,
      aplicadoPago: fila.aplicado_pago,
      idempotente: fila.idempotente,
    },
    correlationId,
  );

  return {
    exito: true,
    datos: {
      pagoId: fila.pago_id,
      folioRecibo: fila.folio_recibo,
      aplicaciones: fila.aplicaciones,
      saldoAFavorMxn: Number(fila.saldo_a_favor_mxn),
      solicitudId,
    },
  };
}
