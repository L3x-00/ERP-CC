'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { traducirErrorFactura } from '@/modulos/facturacion/servicios/errores-factura';
import { esquemaCancelarFactura } from '@/modulos/facturacion/validaciones/esquemas-facturacion';

export type ResultadoCancelarFactura = {
  facturaId: string;
  arDesvinculada: string | null;
  actualizadoEn: string;
};

/** SII-B8 F2: cancela una factura (motivo) y desvincula su AR si estaba emitida. */
export async function cancelarFacturaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoCancelarFactura>> {
  const analisis = esquemaCancelarFactura.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const datos = analisis.data;

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'registrar_pagos'))) {
    return { exito: false, error: 'Sin permiso para facturar' };
  }

  const correlationId = nuevoCorrelationId();
  const admin = crearClienteSupabaseAdmin();
  const { data, error } = await admin.rpc('cancelar_factura', {
    p_factura_id: datos.facturaId,
    p_actualizado_en_esperado: datos.actualizadoEn,
    p_motivo: datos.motivo,
    p_actor_id: usuario.id,
    p_correlation_id: correlationId,
  });

  const fila = Array.isArray(data) ? data[0] : null;
  if (error || !fila) {
    await registrarLog(
      usuario,
      'cancelar_factura_rechazado',
      'facturacion',
      datos.facturaId,
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
    'cancelar_factura',
    'facturacion',
    datos.facturaId,
    { motivo: datos.motivo, arDesvinculada: fila.ar_id },
    correlationId,
  );

  return {
    exito: true,
    datos: {
      facturaId: fila.id,
      arDesvinculada: fila.ar_id ?? null,
      actualizadoEn: fila.actualizado_en,
    },
  };
}
