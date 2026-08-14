'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  obtenerDatosTableroProduccionServicio,
  type DatosTableroProduccion,
} from '@/modulos/produccion/servicios/indice';
import { esquemaConsultarTableroProduccion } from '@/modulos/produccion/validaciones/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';

/** Lee el tablero mediante la sesión Supabase para que RLS siga siendo efectiva. */
export async function obtenerTableroProduccionAccion(
  entrada: unknown,
): Promise<RespuestaAccion<DatosTableroProduccion>> {
  const analisis = esquemaConsultarTableroProduccion.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'gestionar_produccion'))) {
    return { exito: false, error: 'Sin permiso para consultar Producción' };
  }

  try {
    const cliente = await crearClienteSupabaseServidor();
    return { exito: true, datos: await obtenerDatosTableroProduccionServicio(cliente, analisis.data) };
  } catch (error) {
    console.error('[PRODUCCION] Error al consultar tablero:', error);
    return { exito: false, error: 'No se pudo consultar el tablero de Producción' };
  }
}
