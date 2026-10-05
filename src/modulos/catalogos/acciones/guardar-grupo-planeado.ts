'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { guardarGrupoPlaneadoServicio } from '@/modulos/catalogos/servicios/indice';
import type { GrupoPlaneadoCatalogo } from '@/modulos/catalogos/tipos/indice';
import { esquemaGuardarGrupoPlaneado } from '@/modulos/catalogos/validaciones/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

import { ejecutarAccionCatalogo } from './utilidades-acciones';

export async function guardarGrupoPlaneadoAccion(
  entrada: unknown,
): Promise<RespuestaAccion<GrupoPlaneadoCatalogo>> {
  const analisis = esquemaGuardarGrupoPlaneado.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'catalogo_editar'))) {
    return { exito: false, error: 'Sin permiso para editar catálogos' };
  }

  const { id, codigo, activo } = analisis.data;
  return ejecutarAccionCatalogo(
    usuario,
    id ? 'actualizar_grupo_planeado_catalogo' : 'crear_grupo_planeado_catalogo',
    id ?? codigo,
    () => guardarGrupoPlaneadoServicio(crearClienteSupabaseAdmin(), analisis.data),
    { codigo, activo },
  );
}
