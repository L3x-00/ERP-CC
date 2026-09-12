'use server';

import { cookies } from 'next/headers';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import type { SesionOperador } from '@/modulos/autenticacion/tipos/indice';
import {
  COOKIE_SESION_OPERADOR,
  MAXIMO_SESION_OPERADOR_MINUTOS,
} from '@/nucleo/autenticacion/constantes';
import {
  deserializarSesionOperador,
  serializarSesionOperador,
  sesionOperadorExpirada,
  sesionOperadorVencidaAbsoluta,
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
    if (!sesion || sesionOperadorExpirada(sesion) || sesionOperadorVencidaAbsoluta(sesion)) {
      almacenCookies.delete(COOKIE_SESION_OPERADOR);
      return { exito: false, error: 'Sesión expirada' };
    }

    const sesionRenovada: SesionOperador = {
      ...sesion,
      ultimaActividadEn: new Date().toISOString(),
    };

    // La cookie nunca puede vivir más allá de la vigencia absoluta de la sesión.
    const inicioMs = new Date(sesion.iniciadaEn).getTime();
    const restanteAbsolutoSegundos = Math.max(
      0,
      Math.floor((inicioMs + MAXIMO_SESION_OPERADOR_MINUTOS * 60 * 1000 - Date.now()) / 1000),
    );
    const maxAge = Math.min(sesionRenovada.timeoutMinutos * 60, restanteAbsolutoSegundos);

    const nuevoValor = await serializarSesionOperador(sesionRenovada);
    almacenCookies.set(COOKIE_SESION_OPERADOR, nuevoValor, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge,
    });

    return {
      exito: true,
      datos: { segundosRestantes: maxAge },
    };
  } catch (errorInesperado) {
    console.error('[AUTENTICACION] Error inesperado al renovar sesión:', errorInesperado);
    return { exito: false, error: 'Sesión expirada' };
  }
}
