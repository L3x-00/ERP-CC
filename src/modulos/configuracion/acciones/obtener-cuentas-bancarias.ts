'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { listarCuentasBancarias } from '@/modulos/configuracion/servicios/indice';
import type { CuentaBancaria } from '@/modulos/configuracion/tipos/indice';

/**
 * UI-02: lectura autorizada de cuentas bancarias para la sección que ahora vive
 * en Cobros y tesorería. Conserva el permiso original `configuracion`; tener
 * acceso a finanzas no concede administración bancaria.
 */
export async function obtenerCuentasBancariasAccion(): Promise<RespuestaAccion<CuentaBancaria[]>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'configuracion'))) {
    return { exito: false, error: 'Sin permiso para configurar el sistema' };
  }

  try {
    const cuentas = await listarCuentasBancarias(await crearClienteSupabaseServidor(), false);
    return { exito: true, datos: cuentas };
  } catch (error) {
    console.error('[CONFIGURACION] Error al consultar las cuentas bancarias:', error);
    return { exito: false, error: 'No se pudieron consultar las cuentas bancarias' };
  }
}
