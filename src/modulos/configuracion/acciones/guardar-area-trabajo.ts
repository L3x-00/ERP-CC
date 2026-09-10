'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { guardarAreaTrabajoServicio } from '@/modulos/configuracion/servicios/indice';
import type { AreaTrabajoConfig } from '@/modulos/configuracion/tipos/indice';
import { esquemaAreaTrabajo } from '@/modulos/configuracion/validaciones/indice';
import { ejecutarAccionConfiguracion } from './utilidades-acciones';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

export async function guardarAreaTrabajoAccion(
  entrada: unknown,
): Promise<RespuestaAccion<AreaTrabajoConfig>> {
  const analisis = esquemaAreaTrabajo.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'configuracion'))) return { exito: false, error: 'Sin permiso para configurar el sistema' };

  return ejecutarAccionConfiguracion(
    usuario,
    analisis.data.id ? 'actualizar_area_trabajo' : 'crear_area_trabajo',
    analisis.data.id ?? usuario.id,
    () => guardarAreaTrabajoServicio(crearClienteSupabaseAdmin(), analisis.data),
    { codigo: analisis.data.codigo, activo: analisis.data.activo },
  );
}
