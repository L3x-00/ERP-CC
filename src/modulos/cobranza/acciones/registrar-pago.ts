'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  mensajeErrorCobranza,
  registrarPagoServicio,
  type PagoRegistrado,
} from '@/modulos/cobranza/servicios/cobranza-servicio';
import { esquemaRegistrarPago } from '@/modulos/cobranza/validaciones/cobranza';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

export async function registrarPagoAccion(entrada: unknown): Promise<RespuestaAccion<PagoRegistrado>> {
  const analisis = esquemaRegistrarPago.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'registrar_pagos'))) {
    return { exito: false, error: 'Sin permiso para registrar pagos' };
  }

  try {
    const pago = await registrarPagoServicio(crearClienteSupabaseAdmin(), {
      ...analisis.data,
      usuarioId: usuario.id,
    });
    await registrarLog(usuario, 'registrar_pago_ar', 'cobranza', pago.pagoId, {
      arId: pago.arId,
      folioRecibo: pago.folioRecibo,
      idempotente: pago.idempotente,
      estadoAr: pago.estadoAr,
    });
    return { exito: true, datos: pago };
  } catch (error) {
    console.error('[COBRANZA] Error al registrar pago:', error);
    await registrarLog(usuario, 'pago_ar_rechazado', 'cobranza', analisis.data.arId, {
      solicitudId: analisis.data.solicitudId,
    });
    return { exito: false, error: mensajeErrorCobranza(error) };
  }
}
