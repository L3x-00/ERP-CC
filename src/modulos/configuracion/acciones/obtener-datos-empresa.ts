'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { obtenerConfiguracionGeneral } from '@/modulos/configuracion/servicios/indice';
import type { ConfiguracionEmpresa } from '@/modulos/configuracion/tipos/indice';

/**
 * UI-02: lectura acotada de los datos de empresa para el modal del menú de
 * usuario. Reutiliza el servicio existente y conserva el permiso `configuracion`.
 */
export async function obtenerDatosEmpresaAccion(): Promise<RespuestaAccion<ConfiguracionEmpresa>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'configuracion'))) {
    return { exito: false, error: 'Sin permiso para configurar el sistema' };
  }

  try {
    const configuracion = await obtenerConfiguracionGeneral(await crearClienteSupabaseServidor());
    return { exito: true, datos: configuracion.empresa };
  } catch (error) {
    console.error('[CONFIGURACION] Error al consultar los datos de empresa:', error);
    return { exito: false, error: 'No se pudieron consultar los datos de empresa' };
  }
}
