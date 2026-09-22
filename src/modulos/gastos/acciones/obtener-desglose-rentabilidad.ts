'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  mensajeErrorGastos,
  obtenerDesgloseRentabilidadServicio,
} from '@/modulos/gastos/servicios/indice';
import type { DesgloseRentabilidadOrden } from '@/modulos/gastos/tipos/indice';
import { esquemaConsultarRentabilidadOrden } from '@/modulos/gastos/validaciones/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

/**
 * OBS-29: desglose por estación/rubro de la rentabilidad de una orden. Mismo
 * permiso que la rentabilidad (`ver_finanzas`); el RPC solo lo ejecuta el
 * service_role.
 */
export async function obtenerDesgloseRentabilidadOrdenAccion(
  entrada: unknown,
): Promise<RespuestaAccion<DesgloseRentabilidadOrden[]>> {
  const analisis = esquemaConsultarRentabilidadOrden.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'ver_finanzas'))) {
    return { exito: false, error: 'Sin permiso para consultar rentabilidad' };
  }
  try {
    const datos = await obtenerDesgloseRentabilidadServicio(
      crearClienteSupabaseAdmin(),
      analisis.data.ordenId,
    );
    return { exito: true, datos };
  } catch (error) {
    console.error('[GASTOS] Error al consultar desglose de rentabilidad:', error);
    return { exito: false, error: mensajeErrorGastos(error) };
  }
}
