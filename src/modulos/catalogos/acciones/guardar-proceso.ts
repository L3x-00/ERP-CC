'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { guardarProcesoServicio } from '@/modulos/catalogos/servicios/indice';
import type { ProcesoCatalogo } from '@/modulos/catalogos/tipos/indice';
import { esquemaGuardarProceso } from '@/modulos/catalogos/validaciones/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

import { ejecutarAccionCatalogo } from './utilidades-acciones';

export async function guardarProcesoAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ProcesoCatalogo>> {
  const analisis = esquemaGuardarProceso.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'catalogo_editar'))) {
    return { exito: false, error: 'Sin permiso para editar catálogos' };
  }

  const { id, codigo, requiereArchivoTecnico } = analisis.data;
  return ejecutarAccionCatalogo(
    usuario,
    id ? 'actualizar_proceso_catalogo' : 'crear_proceso_catalogo',
    id ?? codigo,
    () => guardarProcesoServicio(crearClienteSupabaseAdmin(), analisis.data),
    { codigo, requiereArchivoTecnico },
  );
}
