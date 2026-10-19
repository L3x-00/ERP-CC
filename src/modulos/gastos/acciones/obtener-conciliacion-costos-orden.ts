'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  mensajeErrorGastos,
  obtenerConciliacionCostosOrdenServicio,
} from '@/modulos/gastos/servicios/indice';
import type { ConciliacionCostosOrden } from '@/modulos/gastos/tipos/indice';
import { esquemaConsultarRentabilidadOrden } from '@/modulos/gastos/validaciones/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

/** C10.2: conciliación Estimado/Comprometido/Real de una Orden (solo lectura). */
export async function obtenerConciliacionCostosOrdenAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ConciliacionCostosOrden>> {
  const analisis = esquemaConsultarRentabilidadOrden.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'ver_finanzas'))) {
    return { exito: false, error: 'Sin permiso para consultar la conciliación' };
  }

  try {
    const datos = await obtenerConciliacionCostosOrdenServicio(
      crearClienteSupabaseAdmin(),
      analisis.data.ordenId,
    );
    return { exito: true, datos };
  } catch (error) {
    console.error('[GASTOS] Error al consultar la conciliación:', error);
    return { exito: false, error: mensajeErrorGastos(error) };
  }
}
