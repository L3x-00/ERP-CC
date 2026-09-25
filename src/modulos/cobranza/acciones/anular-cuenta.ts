'use server';

import { z } from 'zod';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { ErrorCobranza, anularCuentaServicio, mensajeErrorCobranza } from '@/modulos/cobranza/servicios/cobranza-servicio';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

const esquema = z.object({
  arId: z.uuid('Cuenta inválida'),
  actualizadoEn: z.iso.datetime({ offset: true, message: 'Token de versión inválido' }),
  motivo: z.string().trim().min(3, 'Indica el motivo de la anulación').max(300),
}).strict();

/** AR-16: anula la cuenta sin borrar pagos, reversos ni referencia. */
export async function anularCuentaAccion(entrada: unknown): Promise<RespuestaAccion<{ id: string; estado: string; saldoPendiente: number; motivoAnulacion: string }>> {
  const analisis = esquema.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'registrar_pagos'))) return { exito: false, error: 'Sin permiso para anular cuentas' };
  try {
    const cuenta = await anularCuentaServicio(crearClienteSupabaseAdmin(), {
      ...analisis.data,
      actorId: usuario.id,
    });
    await registrarLog(usuario, 'anular_cuenta_por_cobrar', 'cobranza', cuenta.id, {
      motivo: cuenta.motivoAnulacion,
    });
    return { exito: true, datos: cuenta };
  } catch (error) {
    const codigo = error instanceof ErrorCobranza ? error.codigo : 'desconocido';
    console.error('[COBRANZA] Error al anular cuenta:', error);
    await registrarLog(usuario, 'anular_cuenta_rechazada', 'cobranza', analisis.data.arId, { codigo });
    return { exito: false, error: mensajeErrorCobranza(error) };
  }
}
