'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  obtenerResumenCarteraServicio,
  type ResumenCartera,
} from '@/modulos/cobranza/servicios/cobranza-servicio';
import { esquemaConsultarCartera } from '@/modulos/cobranza/validaciones/cobranza';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';

export async function obtenerResumenCarteraAccion(
  entrada: unknown = {},
): Promise<RespuestaAccion<ResumenCartera>> {
  const analisis = esquemaConsultarCartera.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'ver_finanzas'))) {
    return { exito: false, error: 'Sin permiso para consultar cobranza' };
  }

  try {
    return {
      exito: true,
      datos: await obtenerResumenCarteraServicio(await crearClienteSupabaseServidor(), analisis.data),
    };
  } catch (error) {
    console.error('[COBRANZA] Error al consultar cartera:', error);
    return { exito: false, error: 'No se pudo consultar la cartera' };
  }
}
