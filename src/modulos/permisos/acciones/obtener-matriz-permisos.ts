'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import type { RolUsuario } from '@/modulos/autenticacion/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

import type { MatrizPermisos } from '../tipos/indice';

/**
 * Devuelve el catálogo de permisos y la asignación por rol para la matriz.
 * Solo admin activo (RBAC no delegable: ver nota en `asignar-permiso.ts`).
 */
export async function obtenerMatrizPermisosAccion(): Promise<RespuestaAccion<MatrizPermisos>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario || usuario.rol !== 'admin' || !usuario.activo) {
    return { exito: false, error: 'Solo un administrador activo puede ver la matriz de permisos' };
  }

  const clienteAdmin = crearClienteSupabaseAdmin();
  const [consultaPermisos, consultaAsignaciones] = await Promise.all([
    clienteAdmin
      .from('permisos')
      .select('codigo, modulo, descripcion, activo')
      .order('modulo')
      .order('codigo'),
    clienteAdmin.from('permisos_rol').select('rol, permiso'),
  ]);

  if (consultaPermisos.error || consultaAsignaciones.error || !consultaPermisos.data || !consultaAsignaciones.data) {
    console.error(
      '[PERMISOS] No se pudo cargar la matriz:',
      consultaPermisos.error?.message ?? consultaAsignaciones.error?.message,
    );
    return { exito: false, error: 'No se pudo cargar la matriz de permisos' };
  }

  const asignaciones: Record<RolUsuario, string[]> = {
    admin: [],
    vendedor: [],
    gerente: [],
    contador: [],
    operador: [],
  };
  for (const fila of consultaAsignaciones.data) {
    const rol = fila.rol as RolUsuario;
    (asignaciones[rol] ??= []).push(fila.permiso);
  }

  return {
    exito: true,
    datos: { permisos: consultaPermisos.data, asignaciones },
  };
}
