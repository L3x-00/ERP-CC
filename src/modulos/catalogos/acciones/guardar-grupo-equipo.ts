'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { guardarGrupoEquipoServicio } from '@/modulos/catalogos/servicios/indice';
import type { GrupoEquipoCatalogo } from '@/modulos/catalogos/tipos/indice';
import { esquemaGuardarGrupoEquipo } from '@/modulos/catalogos/validaciones/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

import { ejecutarAccionCatalogo } from './utilidades-acciones';

export async function guardarGrupoEquipoAccion(
  entrada: unknown,
): Promise<RespuestaAccion<GrupoEquipoCatalogo>> {
  const analisis = esquemaGuardarGrupoEquipo.safeParse(entrada);
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
    id ? 'actualizar_grupo_equipo_catalogo' : 'crear_grupo_equipo_catalogo',
    id ?? codigo,
    () => guardarGrupoEquipoServicio(crearClienteSupabaseAdmin(), analisis.data),
    { codigo, activo },
  );
}
