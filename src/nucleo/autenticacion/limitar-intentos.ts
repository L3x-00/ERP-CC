import { headers } from 'next/headers';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { BLOQUEO_LOGIN_MINUTOS, INTENTOS_LOGIN_MAXIMOS } from './constantes';

/** Contexto de intento de login: cada uno tiene su propio contador. */
export type ContextoIntento = 'pin' | 'password';

/**
 * Identifica al solicitante para efectos de rate-limiting (no de auditoría).
 * Usa `x-forwarded-for` (IP real del cliente en Vercel/proxies estándar);
 * cae a `x-real-ip` o `'desconocido'` si no está disponible (ej. en local).
 */
export async function obtenerIdentificadorSolicitante(): Promise<string> {
  const listaCabeceras = await headers();
  const reenviadaPor = listaCabeceras.get('x-forwarded-for');
  if (reenviadaPor) {
    return reenviadaPor.split(',')[0].trim();
  }
  return listaCabeceras.get('x-real-ip') ?? 'desconocido';
}

/**
 * Determina si un `bloqueado_hasta` sigue vigente. Función pura (sin I/O)
 * para poder probarla sin depender de la base de datos.
 */
export function bloqueoVigente(bloqueadoHasta: string | null, ahora: Date = new Date()): boolean {
  if (!bloqueadoHasta) {
    return false;
  }
  return new Date(bloqueadoHasta).getTime() > ahora.getTime();
}

/**
 * Verifica si un identificador está bloqueado por exceso de intentos
 * fallidos en el contexto dado ('pin' o 'password').
 */
export async function estaBloqueado(
  identificador: string,
  contexto: ContextoIntento,
): Promise<boolean> {
  const cliente = crearClienteSupabaseAdmin();
  const { data } = await cliente
    .from('intentos_login')
    .select('bloqueado_hasta')
    .eq('identificador', identificador)
    .eq('contexto', contexto)
    .maybeSingle();

  return bloqueoVigente((data as { bloqueado_hasta: string | null } | null)?.bloqueado_hasta ?? null);
}

/**
 * Registra un intento fallido de forma atómica (función SQL
 * `registrar_intento_fallido`, evita condición de carrera entre intentos
 * concurrentes). Al alcanzar `INTENTOS_LOGIN_MAXIMOS` fija el bloqueo por
 * `BLOQUEO_LOGIN_MINUTOS`.
 */
export async function registrarIntentoFallido(
  identificador: string,
  contexto: ContextoIntento,
): Promise<void> {
  const cliente = crearClienteSupabaseAdmin();
  const { error } = await cliente.rpc('registrar_intento_fallido', {
    p_identificador: identificador,
    p_contexto: contexto,
    p_max_intentos: INTENTOS_LOGIN_MAXIMOS,
    p_bloqueo_segundos: BLOQUEO_LOGIN_MINUTOS * 60,
  });

  if (error) {
    console.error('[RATE_LIMIT] Error al registrar intento fallido:', error.message);
  }
}

/**
 * Limpia el contador de intentos tras un login exitoso.
 */
export async function limpiarIntentos(
  identificador: string,
  contexto: ContextoIntento,
): Promise<void> {
  const cliente = crearClienteSupabaseAdmin();
  const { error } = await cliente
    .from('intentos_login')
    .delete()
    .eq('identificador', identificador)
    .eq('contexto', contexto);

  if (error) {
    console.error('[RATE_LIMIT] Error al limpiar intentos:', error.message);
  }
}
