import { cookies } from 'next/headers';
import type { SesionOperador, UsuarioAutenticado } from '@/modulos/autenticacion/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { COOKIE_SESION_OPERADOR } from '@/nucleo/autenticacion/constantes';
import {
  deserializarSesionOperador,
  sesionOperadorEsDelegada,
  sesionOperadorExpirada,
  sesionOperadorRevocadaPorPin,
  sesionOperadorVencidaAbsoluta,
} from '@/nucleo/autenticacion/sesion';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

export type ContextoSesionOperador = {
  operador: UsuarioAutenticado;
  sesion: SesionOperador;
  administrador: UsuarioAutenticado | null;
};

export async function obtenerSesionOperadorFirmada(): Promise<SesionOperador | null> {
  const valorCookie = (await cookies()).get(COOKIE_SESION_OPERADOR)?.value;
  return valorCookie ? deserializarSesionOperador(valorCookie) : null;
}

/**
 * Recupera la identidad de piso solamente si la cookie HMAC sigue vigente y el
 * usuario continúa activo con rol operador. La cookie no basta por sí misma:
 * esta segunda verificación permite revocar acceso al desactivar la cuenta.
 */
export async function obtenerContextoSesionOperadorActiva(): Promise<ContextoSesionOperador | null> {
  const sesion = await obtenerSesionOperadorFirmada();
  if (!sesion || sesionOperadorExpirada(sesion) || sesionOperadorVencidaAbsoluta(sesion)) {
    return null;
  }

  const { data: operador, error } = await crearClienteSupabaseAdmin()
    .from('usuarios')
    .select('id, email, nombre_completo, activo, ultimo_login_at, creado_en, actualizado_en, pin_cambiado_en')
    .eq('id', sesion.usuarioId)
    .eq('rol', 'operador')
    .eq('activo', true)
    .maybeSingle();

  if (error || !operador || sesionOperadorRevocadaPorPin(sesion, operador.pin_cambiado_en)) {
    return null;
  }

  const operadorAutenticado: UsuarioAutenticado = {
    id: operador.id,
    email: operador.email,
    nombreCompleto: operador.nombre_completo,
    rol: 'operador',
    activo: operador.activo,
    pinCambiadoEn: operador.pin_cambiado_en,
    ultimoLoginEn: operador.ultimo_login_at,
    creadoEn: operador.creado_en,
    actualizadoEn: operador.actualizado_en,
    permisos: [],
  };

  if (!sesionOperadorEsDelegada(sesion)) {
    return { operador: operadorAutenticado, sesion, administrador: null };
  }

  const administrador = await obtenerUsuarioServidor();
  if (!administrador || administrador.rol !== 'admin'
    || administrador.id !== sesion.administradorId) {
    return null;
  }

  return { operador: operadorAutenticado, sesion, administrador };
}

export async function obtenerOperadorConSesionActiva(): Promise<UsuarioAutenticado | null> {
  return (await obtenerContextoSesionOperadorActiva())?.operador ?? null;
}

/** Rechaza y audita cualquier escritura intentada desde una vista delegada. */
export async function obtenerOperadorParaMutacion(
  accionSolicitada: string,
  recursoId: string,
): Promise<UsuarioAutenticado | null> {
  const contexto = await obtenerContextoSesionOperadorActiva();
  if (!contexto) return null;

  if (!sesionOperadorEsDelegada(contexto.sesion)) {
    return contexto.operador;
  }

  if (contexto.administrador) {
    await registrarLog(
      contexto.administrador,
      'mutacion_vista_operador_rechazada',
      'produccion',
      recursoId,
      {
        accionSolicitada,
        operadorId: contexto.operador.id,
        motivo: contexto.sesion.motivoDelegacion,
      },
    );
  }
  return null;
}
