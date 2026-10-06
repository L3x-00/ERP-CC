'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import type { Json } from '@/compartido/tipos/supabase';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { traducirErrorFactura } from '@/modulos/facturacion/servicios/errores-factura';
import { esquemaActualizarFactura } from '@/modulos/facturacion/validaciones/esquemas-facturacion';

export type ResultadoActualizarFactura = { facturaId: string; actualizadoEn: string };

/** SII-B8 F2: edita montos/RFC de un borrador con compare-and-set. */
export async function actualizarFacturaBorradorAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoActualizarFactura>> {
  const analisis = esquemaActualizarFactura.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const { facturaId, actualizadoEn, datos } = analisis.data;

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'registrar_pagos'))) {
    return { exito: false, error: 'Sin permiso para facturar' };
  }

  const correlationId = nuevoCorrelationId();
  const admin = crearClienteSupabaseAdmin();
  const { data, error } = await admin.rpc('actualizar_factura_borrador', {
    p_factura_id: facturaId,
    p_actualizado_en_esperado: actualizadoEn,
    p_datos: {
      subtotal: datos.subtotal ?? null,
      iva: datos.iva ?? null,
      total: datos.total ?? null,
      rfc_receptor: datos.rfcReceptor ?? null,
    } as unknown as Json,
    p_actor_id: usuario.id,
    p_correlation_id: correlationId,
  });

  const fila = Array.isArray(data) ? data[0] : null;
  if (error || !fila) {
    await registrarLog(
      usuario,
      'actualizar_factura_borrador_rechazado',
      'facturacion',
      facturaId,
      { codigo: (error?.message ?? 'sin_respuesta').slice(0, 120) },
      correlationId,
    );
    return {
      exito: false,
      error: traducirErrorFactura(error?.message ?? '', error?.details ?? undefined),
    };
  }

  await registrarLog(
    usuario,
    'actualizar_factura_borrador',
    'facturacion',
    facturaId,
    { total: datos.total ?? null, rfc: datos.rfcReceptor ?? null },
    correlationId,
  );

  return { exito: true, datos: { facturaId: fila.id, actualizadoEn: fila.actualizado_en } };
}
