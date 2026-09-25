'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  abrirCuentaPorCobrarServicio,
  mensajeErrorCobranza,
  type CuentaAbierta,
} from '@/modulos/cobranza/servicios/cobranza-servicio';
import { esquemaCrearCuentaPorCobrar } from '@/modulos/cobranza/validaciones/cobranza';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

/** Excepción para orden entregada sin AR; la elegibilidad se revalida bajo lock en PostgreSQL. */
export async function abrirCuentaPorCobrarAccion(
  entrada: unknown,
): Promise<RespuestaAccion<CuentaAbierta>> {
  const analisis = esquemaCrearCuentaPorCobrar.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'registrar_pagos'))) {
    return { exito: false, error: 'Sin permiso para abrir cuentas por cobrar' };
  }

  try {
    const cuenta = await abrirCuentaPorCobrarServicio(crearClienteSupabaseAdmin(), {
      ...analisis.data, actorId: usuario.id,
    });
    await registrarLog(usuario, 'abrir_cuenta_por_cobrar', 'cobranza', cuenta.id, {
      ordenId: analisis.data.ordenId,
      moneda: cuenta.moneda,
      montoTotal: analisis.data.montoTotal,
      tipoCambioOrigen: analisis.data.tipoCambioOrigen,
      fechaVencimiento: analisis.data.fechaVencimiento,
      folioFacturaRemision: analisis.data.folioFacturaRemision,
    });
    return { exito: true, datos: cuenta };
  } catch (error) {
    console.error('[COBRANZA] Error al abrir cuenta por cobrar:', error);
    await registrarLog(usuario, 'apertura_cuenta_rechazada', 'cobranza', analisis.data.ordenId, {
      moneda: analisis.data.moneda,
    });
    return { exito: false, error: mensajeErrorCobranza(error) };
  }
}
