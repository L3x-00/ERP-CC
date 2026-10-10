'use server';

import { cookies } from 'next/headers';
import { COOKIE_SESION_OPERADOR } from '@/nucleo/autenticacion/constantes';
import {
  obtenerOperadorConSesionActiva,
  obtenerOperadorParaMutacion,
} from '@/nucleo/autenticacion/obtener-operador-sesion';
import {
  deserializarSesionOperador,
  sesionOperadorEsDelegada,
} from '@/nucleo/autenticacion/sesion';
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

/** Bloquea tambien las mutaciones administrativas mientras exista una vista delegada firmada. */
export async function obtenerActorProduccionParaMutacion(
  accionSolicitada: string,
  recursoId: string,
): Promise<UsuarioAutenticado | null> {
  const valorCookie = (await cookies()).get(COOKIE_SESION_OPERADOR)?.value;
  if (valorCookie) {
    const sesion = await deserializarSesionOperador(valorCookie);
    if (sesion && sesionOperadorEsDelegada(sesion)) {
      return obtenerOperadorParaMutacion(accionSolicitada, recursoId);
    }
  }

  return obtenerActorProduccion();
}
