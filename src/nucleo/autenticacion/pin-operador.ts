import bcrypt from 'bcryptjs';
import { RONDAS_SAL_BCRYPT } from '@/nucleo/autenticacion/constantes';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import {
  filaAUsuario,
  type FilaUsuario,
  type Usuario,
} from '@/modulos/autenticacion/tipos/indice';

/**
 * Genera el hash bcrypt de un PIN de operador.
 *
 * @param pin PIN en texto plano (4 a 6 dígitos).
 * @returns Hash bcrypt listo para guardar en `usuarios.pin_operador`.
 */
export async function hashearPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, RONDAS_SAL_BCRYPT);
}

/**
 * Compara un PIN en texto plano contra un hash bcrypt almacenado.
 *
 * @param pin PIN en texto plano ingresado por el operador.
 * @param hash Hash bcrypt almacenado en la base de datos.
 * @returns `true` si el PIN corresponde al hash.
 */
export async function verificarPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}

/**
 * Busca al operador cuyo PIN coincide con el ingresado.
 *
 * El PIN identifica al operador (no hay nombre de usuario en el piso),
 * por eso se compara con bcrypt contra cada operador activo con PIN
 * configurado. Usa el cliente admin (sin RLS) porque en el login de piso
 * aún no existe sesión Supabase. Solo debe llamarse desde el servidor.
 *
 * @param pin PIN en texto plano (4 a 6 dígitos).
 * @returns El primer usuario cuyo PIN coincide, o `null` si ninguno.
 */
export async function buscarOperadorPorPin(pin: string): Promise<Usuario | null> {
  const cliente = crearClienteSupabaseAdmin();

  const { data, error } = await cliente
    .from('usuarios')
    .select('*')
    .eq('rol', 'operador')
    .eq('activo', true)
    .not('pin_operador', 'is', null);

  if (error || !data) {
    return null;
  }

  for (const fila of data as FilaUsuario[]) {
    if (fila.pin_operador && (await verificarPin(pin, fila.pin_operador))) {
      return filaAUsuario(fila);
    }
  }

  return null;
}
