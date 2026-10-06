'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { traducirErrorFactura } from '@/modulos/facturacion/servicios/errores-factura';
import { esquemaEmitirFactura } from '@/modulos/facturacion/validaciones/esquemas-facturacion';

export type ResultadoEmitirFactura = {
  facturaId: string;
  folioFiscal: string;
  arFolio: string | null;
  arVencimiento: string | null;
  actualizadoEn: string;
};

/** SII-B8 F2: emite el borrador con folio fiscal capturado y vincula la AR. */
export async function emitirFacturaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoEmitirFactura>> {
  const analisis = esquemaEmitirFactura.safeParse(entrada);
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
  const { data, error } = await admin.rpc('emitir_factura', {
    p_factura_id: datos.facturaId,
    p_actualizado_en_esperado: datos.actualizadoEn,
    p_folio_fiscal: datos.folioFiscal,
    p_rfc_receptor: datos.rfcReceptor ?? null,
    p_uuid_fiscal: datos.uuidFiscal ?? null,
    p_actor_id: usuario.id,
    p_correlation_id: correlationId,
  });

  const fila = Array.isArray(data) ? data[0] : null;
  if (error || !fila) {
    console.error('[FACTURACION] Emisión rechazada:', error?.message);
    await registrarLog(
      usuario,
      'emitir_factura_rechazado',
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
    'emitir_factura',
    'facturacion',
    datos.facturaId,
    { folioFiscal: fila.folio_fiscal, arId: fila.ar_id, arFolio: fila.ar_folio },
    correlationId,
  );

  return {
    exito: true,
    datos: {
      facturaId: fila.id,
      folioFiscal: fila.folio_fiscal,
      arFolio: fila.ar_folio ?? null,
      arVencimiento: fila.ar_vencimiento ?? null,
      actualizadoEn: fila.actualizado_en,
    },
  };
}
