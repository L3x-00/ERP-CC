'use server';

import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';
import {
  obtenerFlujoCuentasServicio,
  type FlujoCuenta,
} from '@/modulos/cobranza/servicios/flujo-cuentas-servicio';
import type { RespuestaAccion } from '@/compartido/tipos/indice';

/**
 * Flujo neto por cuenta (OBS-24) para Cobranza: ingresos de pagos y egresos de
 * gastos convertidos a MXN. Solo finanzas (`ver_finanzas`) y siempre bajo RLS
 * del usuario; no expone números de cuenta completos.
 */
export async function obtenerFlujoCuentasAccion(): Promise<RespuestaAccion<FlujoCuenta[]>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'ver_finanzas'))) {
    return { exito: false, error: 'Sin permiso para ver finanzas' };
  }

  try {
    const cliente = await crearClienteSupabaseServidor();
    const filas = await obtenerFlujoCuentasServicio(cliente);
    return { exito: true, datos: filas };
  } catch (error) {
    console.error('[COBRANZA] Error al calcular el flujo por cuenta:', error);
    return { exito: false, error: 'No se pudo calcular el flujo por cuenta' };
  }
}
