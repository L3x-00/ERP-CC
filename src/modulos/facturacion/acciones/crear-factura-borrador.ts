'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import type { Json } from '@/compartido/tipos/supabase';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { traducirErrorFactura } from '@/modulos/facturacion/servicios/errores-factura';
import type { EstadoFactura } from '@/modulos/facturacion/tipos/indice';
import { esquemaCrearFactura } from '@/modulos/facturacion/validaciones/esquemas-facturacion';

export type ResultadoCrearFactura = {
  facturaId: string;
  estado: EstadoFactura;
  yaExistia: boolean;
  actualizadoEn: string;
};

/** SII-B8 F2: crea (o recupera) el borrador de factura de una entrega. */
export async function crearFacturaBorradorAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoCrearFactura>> {
  const analisis = esquemaCrearFactura.safeParse(entrada);
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
  const { data, error } = await admin.rpc('crear_factura_borrador', {
    p_entrega_id: datos.entregaId,
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
    console.error('[FACTURACION] Alta rechazada:', error?.message);
    await registrarLog(
      usuario,
      'crear_factura_borrador_rechazado',
      'facturacion',
      datos.entregaId,
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
    'crear_factura_borrador',
    'facturacion',
    fila.id,
    { entregaId: datos.entregaId, yaExistia: fila.ya_existia },
    correlationId,
  );

  return {
    exito: true,
    datos: {
      facturaId: fila.id,
      estado: fila.estado as EstadoFactura,
      yaExistia: fila.ya_existia,
      actualizadoEn: fila.actualizado_en,
    },
  };
}
