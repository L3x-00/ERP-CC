'use server';

import { obtenerOperadorConSesionActiva } from '@/nucleo/autenticacion/obtener-operador-sesion';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import type { UsuarioAutenticado } from '@/modulos/autenticacion/tipos/indice';

/**
 * SII-B6: actor de una acción de producción. Prefiere la sesión del panel
 * (Supabase) y cae a la sesión HMAC de operador de piso cuando no existe.
 */
export async function obtenerActorProduccion(): Promise<UsuarioAutenticado | null> {
  const usuario = await obtenerUsuarioServidor();
  if (usuario) return usuario;
  return obtenerOperadorConSesionActiva();
}
