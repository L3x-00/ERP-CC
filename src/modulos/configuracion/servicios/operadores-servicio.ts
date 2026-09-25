import 'server-only';
import { randomBytes, randomUUID } from 'node:crypto';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import type { GuardarOperadorInput } from '@/modulos/configuracion/validaciones/indice';

export type OperadorGestionConfig = {
  id: string;
  nombre: string;
  activo: boolean;
  pinConfigurado: boolean;
};

type ResultadoGuardarOperador = {
  operador: OperadorGestionConfig;
  activoAnterior: boolean | null;
};

/** Proyección administrativa: el hash y el identificador Auth nunca salen. */
export async function listarOperadoresGestionServicio(): Promise<OperadorGestionConfig[]> {
  const { data, error } = await crearClienteSupabaseAdmin().from('usuarios')
    .select('id, nombre_completo, activo, pin_operador')
    .eq('rol', 'operador')
    .order('nombre_completo');
  if (error) throw error;
  return (data ?? []).map((fila) => ({
    id: fila.id,
    nombre: fila.nombre_completo,
    activo: fila.activo,
    pinConfigurado: Boolean(fila.pin_operador),
  }));
}

/**
 * Crea una identidad Auth interna con contraseña aleatoria nunca entregada.
 * El trigger la deja como vendedor; solo la RPC administrativa la promueve.
 * Si falla el segundo paso, se elimina únicamente la identidad recién creada.
 */
export async function guardarOperadorServicio(
  actorId: string,
  entrada: GuardarOperadorInput,
): Promise<ResultadoGuardarOperador> {
  const admin = crearClienteSupabaseAdmin();
  let id = entrada.id;
  let creadoAhora = false;
  let activoAnterior: boolean | null = null;

  if (id) {
    const { data: existente, error } = await admin.from('usuarios')
      .select('id, rol, activo').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!existente || existente.rol !== 'operador') throw new Error('operador_inexistente');
    activoAnterior = existente.activo;
  } else {
    const creado = await admin.auth.admin.createUser({
      email: `operador-${randomUUID()}@orca.local`,
      password: randomBytes(48).toString('base64url'),
      email_confirm: true,
      user_metadata: { nombre_completo: entrada.nombre },
    });
    if (creado.error || !creado.data.user) throw new Error('alta_auth_fallida');
    id = creado.data.user.id;
    creadoAhora = true;
  }

  const { error: errorRpc } = await admin.rpc('guardar_operador_admin', {
    p_actor_id: actorId,
    p_operador_id: id,
    p_nombre: entrada.nombre,
    p_pin: entrada.pin,
    p_activo: entrada.activo,
  });
  if (errorRpc) {
    if (creadoAhora) {
      const eliminado = await admin.auth.admin.deleteUser(id);
      if (eliminado.error) {
        // Dos vías independientes de bloqueo si falla la compensación Auth.
        const [bloqueoAuth, bloqueoPerfil] = await Promise.all([
          admin.auth.admin.updateUserById(id, { ban_duration: '876000h' }),
          admin.from('usuarios').update({ activo: false }).eq('id', id),
        ]);
        if (bloqueoAuth.error && bloqueoPerfil.error) {
          console.error('[CONFIGURACION] No se pudo bloquear identidad incompleta:', id);
        }
      }
    }
    throw new Error(errorRpc.message.includes('pin_duplicado') ? 'pin_duplicado' : 'operador_no_guardado');
  }

  const { data: fila, error } = await admin.from('usuarios')
    .select('id, nombre_completo, activo, pin_operador')
    .eq('id', id).single();
  if (error) throw error;
  return {
    operador: {
      id: fila.id,
      nombre: fila.nombre_completo,
      activo: fila.activo,
      pinConfigurado: Boolean(fila.pin_operador),
    },
    activoAnterior,
  };
}
