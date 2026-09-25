'use server';

import { z } from 'zod';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';

const esquema = z.object({
  arId: z.uuid(),
  actualizadoEnEsperado: z.iso.datetime({ offset: true }),
  folioFactura: z.string().trim().min(1).max(60),
  fechaVencimiento: z.iso.datetime({ offset: true }).nullable(),
}).strict();

/** D-04: la factura se vincula a la AR aprobada; jamás abre una segunda cuenta. */
export async function registrarFacturaArAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ cuentaId: string; folioFactura: string }>> {
  const analisis = esquema.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: 'Datos de factura inválidos' };
  const usuario = await obtenerUsuarioServidor();
  if (!usuario || !(await can(usuario, 'registrar_pagos'))) {
    return { exito: false, error: 'Sin permiso para registrar facturas' };
  }

  const { data, error } = await crearClienteSupabaseAdmin().rpc('registrar_factura_ar', {
    p_ar_id: analisis.data.arId,
    p_actualizado_en_esperado: analisis.data.actualizadoEnEsperado,
    p_folio_factura: analisis.data.folioFactura,
    p_fecha_vencimiento: analisis.data.fechaVencimiento,
    p_actor_id: usuario.id,
  });
  const fila = data?.[0];
  if (error || !fila) {
    return { exito: false, error: error?.message.includes('cuenta_desactualizada')
      ? 'La cuenta cambió. Actualiza la cartera y vuelve a revisar la factura.'
      : error?.message.includes('vencimiento_no_corresponde_cobrabilidad')
        ? 'La cuenta aún no es cobrable; registra el folio sin vencimiento.'
        : 'No se pudo registrar la factura.' };
  }
  await registrarLog(usuario, 'registrar_factura_ar', 'cobranza', fila.cuenta_id, {
    referenciaFiscal: fila.folio_factura,
    fechaVencimiento: fila.fecha_vencimiento,
  });
  return { exito: true, datos: { cuentaId: fila.cuenta_id, folioFactura: fila.folio_factura } };
}
