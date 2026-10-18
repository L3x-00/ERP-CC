'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { obtenerDetalleProgramacionServicio } from '@/modulos/planeacion/servicios/indice';
import type { DetalleProgramacion } from '@/modulos/planeacion/tipos/indice';
import { esquemaObtenerDetalleProgramacion } from '@/modulos/planeacion/validaciones/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

/** Consulta de solo lectura: autoriza antes de crear y usar el cliente privilegiado. */
export async function obtenerDetalleProgramacionAccion(
  entrada: unknown,
): Promise<RespuestaAccion<DetalleProgramacion>> {
  const analisis = esquemaObtenerDetalleProgramacion.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  const puedeVer = await can(usuario, 'ver_planeacion');
  const puedeConsultar = puedeVer || (await can(usuario, 'gestionar_planeacion'));
  if (!puedeConsultar) {
    return { exito: false, error: 'Sin permiso para consultar Planeación' };
  }

  try {
    const datos = await obtenerDetalleProgramacionServicio(
      crearClienteSupabaseAdmin(),
      analisis.data.programacionId,
    );
    return { exito: true, datos };
  } catch (error) {
    console.error('[PLANEACION] Error al consultar detalle de programación:', error);
    return { exito: false, error: 'No se pudo consultar el detalle de la programación' };
  }
}
