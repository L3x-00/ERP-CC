'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  mensajeErrorGastos,
  obtenerRentabilidadOrdenServicio,
} from '@/modulos/gastos/servicios/indice';
import type { CalculoRentabilidadOrden } from '@/modulos/gastos/tipos/indice';
import { esquemaConsultarRentabilidadOrden } from '@/modulos/gastos/validaciones/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

export async function obtenerRentabilidadOrdenAccion(
  entrada: unknown,
): Promise<RespuestaAccion<CalculoRentabilidadOrden>> {
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
    const datos = await obtenerRentabilidadOrdenServicio(
      crearClienteSupabaseAdmin(),
      analisis.data.ordenId,
    );
    return { exito: true, datos };
  } catch (error) {
    console.error('[GASTOS] Error al consultar rentabilidad:', error);
    return { exito: false, error: mensajeErrorGastos(error) };
  }
}
