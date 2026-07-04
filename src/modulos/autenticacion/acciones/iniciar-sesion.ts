'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import {
  filaAUsuario,
  type FilaUsuario,
  type UsuarioAutenticado,
} from '@/modulos/autenticacion/tipos/indice';
import { esquemaIniciarSesion } from '@/modulos/autenticacion/validaciones/esquemas-iniciar-sesion';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import {
  estaBloqueado,
  limpiarIntentos,
  obtenerIdentificadorSolicitante,
  registrarIntentoFallido,
} from '@/nucleo/autenticacion/limitar-intentos';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';

/** Mensaje genérico: nunca revela si el email existe, si la contraseña era
 * correcta, o si la cuenta está desactivada (evita usarlo como oráculo). */
const MENSAJE_CREDENCIALES_INVALIDAS = 'Credenciales inválidas o correo no verificado';
const MENSAJE_BLOQUEADO = 'Demasiados intentos. Intenta de nuevo más tarde.';

/**
 * Server Action de inicio de sesión con email y contraseña (Supabase Auth).
 *
 * Valida la entrada con Zod, aplica rate-limiting por IP, autentica contra
 * Supabase, verifica que la cuenta esté activa, actualiza `ultimo_login_at` y
 * registra el evento en auditoría. Los errores esperados se retornan como
 * `RespuestaAccion` con mensajes genéricos (nunca revela si el email existe ni
 * si la cuenta está desactivada — eso sería un oráculo para credential stuffing).
 *
 * @param entrada Datos sin validar del formulario ({ email, contrasena }).
 * @returns `{ exito: true }` si la sesión quedó iniciada (el cliente redirige
 * a /tablero) o `{ exito: false, error }` en caso contrario.
 */
export async function iniciarSesionAccion(entrada: unknown): Promise<RespuestaAccion> {
  const resultado = esquemaIniciarSesion.safeParse(entrada);
  if (!resultado.success) {
    return { exito: false, error: 'Datos de inicio de sesión inválidos' };
  }

  try {
    const identificador = await obtenerIdentificadorSolicitante();

    if (await estaBloqueado(identificador, 'password')) {
      return { exito: false, error: MENSAJE_BLOQUEADO };
    }

    const supabase = await crearClienteSupabaseServidor();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: resultado.data.email,
      password: resultado.data.contrasena,
    });

    if (error || !data.user) {
      await registrarIntentoFallido(identificador, 'password');
      return { exito: false, error: MENSAJE_CREDENCIALES_INVALIDAS };
    }

    const { data: fila, error: errorFila } = await supabase
      .from('usuarios')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (errorFila || !fila) {
      // Autenticó pero no tiene perfil en public.usuarios. Causa real logueada
      // internamente; al usuario se le da el mismo mensaje genérico.
      console.error('[AUTENTICACION] Login sin perfil en usuarios:', data.user.id, errorFila?.message);
      await supabase.auth.signOut();
      await registrarIntentoFallido(identificador, 'password');
      return { exito: false, error: MENSAJE_CREDENCIALES_INVALIDAS };
    }

    const usuario = filaAUsuario(fila as FilaUsuario);

    if (!usuario.activo) {
      await supabase.auth.signOut();
      // Mensaje genérico a propósito: distinguir "cuenta desactivada" de
      // "credenciales inválidas" convierte la respuesta en oráculo.
      const usuarioParaLog: UsuarioAutenticado = { ...usuario, permisos: [] };
      try {
        await registrarLog(usuarioParaLog, 'intento_acceso_cuenta_desactivada', 'autenticacion', usuario.id);
      } catch (errorLog) {
        console.error('[AUTENTICACION] Error al registrar intento en cuenta desactivada:', errorLog);
      }
      return { exito: false, error: MENSAJE_CREDENCIALES_INVALIDAS };
    }

    await limpiarIntentos(identificador, 'password');

    const admin = crearClienteSupabaseAdmin();
    await admin
      .from('usuarios')
      .update({ ultimo_login_at: new Date().toISOString() })
      .eq('id', usuario.id);

    const usuarioAutenticado: UsuarioAutenticado = { ...usuario, permisos: [] };
    try {
      await registrarLog(usuarioAutenticado, 'iniciar_sesion', 'autenticacion', usuario.id);
    } catch (errorLog) {
      console.error('[AUTENTICACION] Error al registrar log de inicio de sesión:', errorLog);
    }

    return { exito: true };
  } catch (errorInesperado) {
    console.error('[AUTENTICACION] Error inesperado al iniciar sesión:', errorInesperado);
    return { exito: false, error: 'Error inesperado. Intenta de nuevo.' };
  }
}
