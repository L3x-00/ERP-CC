'use server';

import { cookies } from 'next/headers';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import type { SesionOperador } from '@/modulos/autenticacion/tipos/indice';
import { COOKIE_SESION_OPERADOR } from '@/nucleo/autenticacion/constantes';
import {
  deserializarSesionOperador,
  serializarSesionOperador,
  sesionOperadorExpirada,
} from '@/nucleo/autenticacion/sesion';

/**
 * Server Action que renueva la sesión corta del operador de piso.
 *
 * Lee la cookie de sesión de operador; si es inválida o ya expiró por
 * inactividad, la borra y retorna error. Si es válida, actualiza
 * `ultimaActividadEn` al momento actual, re-serializa y re-establece la
 * cookie con el timeout completo.
 *
 * @returns `{ exito: true, datos: { segundosRestantes } }` con los segundos
 * completos del timeout renovado, o `{ exito: false, error: 'Sesión expirada' }`.
 */
export async function renovarSesionAccion(): Promise<
  RespuestaAccion<{ segundosRestantes: number }>
> {
  try {
    const almacenCookies = await cookies();
    const valorCookie = almacenCookies.get(COOKIE_SESION_OPERADOR)?.value;

    if (!valorCookie) {
      return { exito: false, error: 'Sesión expirada' };
    }

    const sesion = await deserializarSesionOperador(valorCookie);
    if (!sesion || sesionOperadorExpirada(sesion)) {
      almacenCookies.delete(COOKIE_SESION_OPERADOR);
      return { exito: false, error: 'Sesión expirada' };
    }

    const sesionRenovada: SesionOperador = {
      ...sesion,
      ultimaActividadEn: new Date().toISOString(),
    };

    const nuevoValor = await serializarSesionOperador(sesionRenovada);
    almacenCookies.set(COOKIE_SESION_OPERADOR, nuevoValor, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: sesionRenovada.timeoutMinutos * 60,
    });

    return {
      exito: true,
      datos: { segundosRestantes: sesionRenovada.timeoutMinutos * 60 },
    };
  } catch (errorInesperado) {
    console.error('[AUTENTICACION] Error inesperado al renovar sesión:', errorInesperado);
    return { exito: false, error: 'Sesión expirada' };
  }
}
