'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { consultarGastosServicio } from '@/modulos/gastos/servicios/indice';
import type { Gasto } from '@/modulos/gastos/tipos/indice';
import { esquemaConsultarGastos } from '@/modulos/gastos/validaciones/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';

export async function obtenerGastosAccion(
  entrada: unknown = {},
): Promise<RespuestaAccion<Gasto[]>> {
  const analisis = esquemaConsultarGastos.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'ver_finanzas'))) {
    return { exito: false, error: 'Sin permiso para consultar gastos' };
  }
  try {
    const gastos = await consultarGastosServicio(
      await crearClienteSupabaseServidor(),
      analisis.data,
    );
    return { exito: true, datos: gastos };
  } catch (error) {
    console.error('[GASTOS] Error al consultar gastos:', error);
    return { exito: false, error: 'No se pudo consultar los gastos' };
  }
}
