'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  ErrorPlaneacion,
  obtenerDatosCalendarioPlaneacionServicio,
  type DatosCalendarioPlaneacion,
} from '@/modulos/planeacion/servicios/indice';
import { esquemaConsultarCalendarioPlaneacion } from '@/modulos/planeacion/validaciones/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';

/** Lee el calendario con permisos de Planeación y un rango explícitamente acotado. */
export async function obtenerCalendarioPlaneacionAccion(
  entrada: unknown,
): Promise<RespuestaAccion<DatosCalendarioPlaneacion>> {
  const analisis = esquemaConsultarCalendarioPlaneacion.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  const puedeVer = await can(usuario, 'ver_planeacion');
  const puedeGestionar = puedeVer || (await can(usuario, 'gestionar_planeacion'));
  if (!puedeGestionar) {
    return { exito: false, error: 'Sin permiso para consultar Planeación' };
  }

  try {
    const cliente = await crearClienteSupabaseServidor();
    const datos = await obtenerDatosCalendarioPlaneacionServicio(
      cliente,
      crearClienteSupabaseAdmin(),
      analisis.data,
    );
    return { exito: true, datos };
  } catch (error) {
    console.error('[PLANEACION] Error al consultar calendario:', error);
    const codigo = error instanceof ErrorPlaneacion ? error.codigo : 'desconocido';
    return {
      exito: false,
      error:
        codigo === 'rango_fechas_invalido'
          ? 'El rango de fechas no es válido'
          : 'No se pudo consultar el calendario',
    };
  }
}
