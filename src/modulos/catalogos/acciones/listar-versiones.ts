'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { listarVersionesServicio } from '@/modulos/catalogos/servicios/indice';
import type { VersionCatalogo } from '@/modulos/catalogos/tipos/indice';
import { esquemaListarVersiones } from '@/modulos/catalogos/validaciones/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

/** Historial de versiones de un registro (snapshot completo por versión). */
export async function listarVersionesAccion(
  entrada: unknown,
): Promise<RespuestaAccion<VersionCatalogo[]>> {
  const analisis = esquemaListarVersiones.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'catalogo_ver'))) {
    return { exito: false, error: 'Sin permiso para ver catálogos' };
  }

  try {
    const datos = await listarVersionesServicio(crearClienteSupabaseAdmin(), analisis.data);
    return { exito: true, datos };
  } catch (error) {
    console.error('[CATALOGOS] Error al consultar versiones:', error);
    return { exito: false, error: 'No se pudo consultar el historial' };
  }
}
