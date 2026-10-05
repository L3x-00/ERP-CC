'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { alternarActivoServicio } from '@/modulos/catalogos/servicios/indice';
import { esquemaAlternarActivo } from '@/modulos/catalogos/validaciones/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

import { ejecutarAccionCatalogo } from './utilidades-acciones';

/**
 * Desactiva o reactiva un registro de catálogo. No existe eliminación: los
 * códigos desactivados dejan de ofrecerse en registros nuevos y permanecen
 * visibles en históricos.
 */
export async function alternarActivoAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ id: string; activo: boolean }>> {
  const analisis = esquemaAlternarActivo.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'catalogo_editar'))) {
    return { exito: false, error: 'Sin permiso para editar catálogos' };
  }

  const { entidad, id, activo } = analisis.data;
  return ejecutarAccionCatalogo(
    usuario,
    `${activo ? 'activar' : 'desactivar'}_${entidad}`,
    id,
    () => alternarActivoServicio(crearClienteSupabaseAdmin(), analisis.data),
    { entidad, activo },
  );
}
