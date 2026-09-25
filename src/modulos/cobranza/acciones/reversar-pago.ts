'use server';

import { z } from 'zod';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { ErrorCobranza, mensajeErrorCobranza, reversarPagoServicio } from '@/modulos/cobranza/servicios/cobranza-servicio';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

const esquema = z.object({
  pagoId: z.uuid('Pago inválido'),
  motivo: z.string().trim().min(3, 'Indica el motivo del reverso').max(300),
}).strict();

/** AR-08: revierte un pago con motivo; nunca edita ni borra el movimiento original. */
export async function reversarPagoAccion(entrada: unknown): Promise<RespuestaAccion<{ pagoId: string; arId: string; folioRecibo: string; saldoPendiente: number; estadoAr: string; monederoRevertidoMxn: number }>> {
  const analisis = esquema.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'registrar_pagos'))) return { exito: false, error: 'Sin permiso para corregir pagos' };
  try {
    const reverso = await reversarPagoServicio(crearClienteSupabaseAdmin(), {
      ...analisis.data,
      actorId: usuario.id,
    });
    await registrarLog(usuario, 'reversar_pago', 'cobranza', reverso.pagoId, {
      arId: reverso.arId, folioRecibo: reverso.folioRecibo,
    });
    return { exito: true, datos: reverso };
  } catch (error) {
    const codigo = error instanceof ErrorCobranza ? error.codigo : 'desconocido';
    console.error('[COBRANZA] Error al reversar pago:', error);
    await registrarLog(usuario, 'reversar_pago_rechazado', 'cobranza', analisis.data.pagoId, { codigo });
    return { exito: false, error: mensajeErrorCobranza(error) };
  }
}
