'use server';

import { cookies } from 'next/headers';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import type {
  SesionOperador,
  UsuarioAutenticado,
} from '@/modulos/autenticacion/tipos/indice';
import { esquemaValidarPin } from '@/modulos/autenticacion/validaciones/esquemas-pin';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import {
  COOKIE_SESION_OPERADOR,
  TIMEOUT_SESION_OPERADOR_MINUTOS,
} from '@/nucleo/autenticacion/constantes';
import {
  estaBloqueado,
  limpiarIntentos,
  obtenerIdentificadorSolicitante,
  registrarIntentoFallido,
} from '@/nucleo/autenticacion/limitar-intentos';
import { buscarOperadorPorPin } from '@/nucleo/autenticacion/pin-operador';
import { serializarSesionOperador } from '@/nucleo/autenticacion/sesion';

const MENSAJE_PIN_INVALIDO = 'PIN inválido';
const MENSAJE_BLOQUEADO = 'Demasiados intentos. Intenta de nuevo más tarde.';

/**
 * Server Action de acceso de operador de piso mediante PIN.
 *
 * Valida el formato del PIN con Zod, busca al operador comparando el hash
 * bcrypt, crea la sesión corta de operador (cookie httpOnly firmada con
 * HMAC) y registra el evento en auditoría. Mensajes de error genéricos:
 * nunca revela si el PIN existe.
 *
 * @param entrada Datos sin validar ({ pin }).
 * @returns `{ exito: true, datos: { nombreUsuario } }` si el PIN es válido
 * (el cliente redirige a /produccion-piso) o `{ exito: false, error }`.
 */
export async function validarPinAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ nombreUsuario: string }>> {
  const resultado = esquemaValidarPin.safeParse(entrada);
  if (!resultado.success) {
    return { exito: false, error: MENSAJE_PIN_INVALIDO };
  }

  try {
    const identificador = await obtenerIdentificadorSolicitante();

    if (await estaBloqueado(identificador, 'pin')) {
      return { exito: false, error: MENSAJE_BLOQUEADO };
    }

    const operador = await buscarOperadorPorPin(resultado.data.pin);
    if (!operador) {
      await registrarIntentoFallido(identificador, 'pin');
      return { exito: false, error: MENSAJE_PIN_INVALIDO };
    }

    await limpiarIntentos(identificador, 'pin');

    const ahora = new Date().toISOString();
    const sesion: SesionOperador = {
      usuarioId: operador.id,
      nombreUsuario: operador.nombreCompleto,
      iniciadaEn: ahora,
      ultimaActividadEn: ahora,
      timeoutMinutos: TIMEOUT_SESION_OPERADOR_MINUTOS,
    };

    const valorCookie = await serializarSesionOperador(sesion);
    const almacenCookies = await cookies();
    almacenCookies.set(COOKIE_SESION_OPERADOR, valorCookie, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: TIMEOUT_SESION_OPERADOR_MINUTOS * 60,
    });

    const operadorAutenticado: UsuarioAutenticado = { ...operador, permisos: [] };
    try {
      await registrarLog(operadorAutenticado, 'iniciar_sesion_pin', 'autenticacion', operador.id);
    } catch (errorLog) {
      console.error('[AUTENTICACION] Error al registrar log de PIN:', errorLog);
    }

    return { exito: true, datos: { nombreUsuario: operador.nombreCompleto } };
  } catch (errorInesperado) {
    console.error('[AUTENTICACION] Error inesperado al validar PIN:', errorInesperado);
    return { exito: false, error: 'Error inesperado. Intenta de nuevo.' };
  }
}
