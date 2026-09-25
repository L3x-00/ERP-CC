'use server';

import { z } from 'zod';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { ErrorCobranza, mensajeErrorCobranza, registrarAbonoHeredadoServicio } from '@/modulos/cobranza/servicios/cobranza-servicio';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

const esquema = z.object({
  arId: z.uuid('Cuenta inválida'),
  monto: z.number().positive('El anticipo debe ser mayor a cero').max(99999999.9999),
  notas: z.string().trim().max(300).optional(),
}).strict();

/** AR-09: captura única del anticipo heredado, separada de los pagos correctibles. */
export async function registrarAbonoHeredadoAccion(entrada: unknown): Promise<RespuestaAccion<{ arId: string; saldoPendiente: number; estado: string; abonoHeredado: number }>> {
  const analisis = esquema.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'registrar_pagos'))) return { exito: false, error: 'Sin permiso para registrar anticipos heredados' };
  try {
    const registro = await registrarAbonoHeredadoServicio(crearClienteSupabaseAdmin(), {
      ...analisis.data,
      actorId: usuario.id,
    });
    await registrarLog(usuario, 'registrar_abono_heredado', 'cobranza', registro.arId, {
      monto: registro.abonoHeredado, saldoPendiente: registro.saldoPendiente,
    });
    return { exito: true, datos: registro };
  } catch (error) {
    const codigo = error instanceof ErrorCobranza ? error.codigo : 'desconocido';
    console.error('[COBRANZA] Error al registrar anticipo heredado:', error);
    await registrarLog(usuario, 'abono_heredado_rechazado', 'cobranza', analisis.data.arId, { codigo });
    return { exito: false, error: mensajeErrorCobranza(error) };
  }
}
