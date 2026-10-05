'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';

import {
  filaARegistroActividad,
  type DatosActividad,
  type FilaActividad,
} from '../tipos/indice';
import { construirFiltrosActividad, parametrosActividadRpc } from '../utilidades/actividad';
import { esquemaFiltrosActividad } from '../validaciones/esquemas-actividad';

/**
 * Server Action de la vista Actividad: valida sesión y permiso con `can()`,
 * valida los filtros con Zod y consulta la RPC `obtener_actividad` con el
 * cliente admin (la RPC solo acepta `service_role` y revalida al actor).
 * El `contexto` (detalles) viaja únicamente cuando el actor es admin.
 *
 * @param filtros - Filtros sin validar (incluye cursor de paginación opcional).
 * @returns Página de eventos con etiquetas legibles y bandera de continuación.
 */
export async function obtenerActividadAccion(
  filtros: unknown,
): Promise<RespuestaAccion<DatosActividad>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }
  if (!(await can(usuario, 'actividad_vista'))) {
    return { exito: false, error: 'Sin permiso para ver la actividad' };
  }

  const resultado = esquemaFiltrosActividad.safeParse(filtros ?? {});
  if (!resultado.success) {
    return { exito: false, error: 'Filtros inválidos' };
  }

  const parametros = parametrosActividadRpc(construirFiltrosActividad(resultado.data), usuario.id);
  const cliente = crearClienteSupabaseAdmin();
  const { data, error } = await cliente.rpc('obtener_actividad', parametros);

  if (error || !data) {
    console.error('[ACTIVIDAD] Error al consultar la actividad:', error?.message);
    return { exito: false, error: 'No se pudo obtener la actividad' };
  }

  const filas = data as FilaActividad[];
  return {
    exito: true,
    datos: {
      registros: filas.map(filaARegistroActividad),
      hayMas: filas[0]?.hay_mas ?? false,
    },
  };
}
