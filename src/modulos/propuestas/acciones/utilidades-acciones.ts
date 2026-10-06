import type { RespuestaAccion } from '@/compartido/tipos/indice';
import type { Json } from '@/compartido/tipos/supabase';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { traducirErrorPropuesta } from '@/modulos/propuestas/servicios/errores-propuesta';

/** Lee una clave string de la respuesta JSONB de una RPC. */
export function leerTexto(datos: unknown, clave: string): string | null {
  if (datos === null || typeof datos !== 'object' || Array.isArray(datos)) return null;
  const valor = (datos as Record<string, unknown>)[clave];
  return typeof valor === 'string' ? valor : null;
}

/** Lee una clave numérica de la respuesta JSONB de una RPC. */
export function leerNumero(datos: unknown, clave: string): number | null {
  if (datos === null || typeof datos !== 'object' || Array.isArray(datos)) return null;
  const valor = (datos as Record<string, unknown>)[clave];
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null;
}

/** Lee una clave booleana de la respuesta JSONB de una RPC. */
export function leerBooleano(datos: unknown, clave: string): boolean | null {
  if (datos === null || typeof datos !== 'object' || Array.isArray(datos)) return null;
  const valor = (datos as Record<string, unknown>)[clave];
  return typeof valor === 'boolean' ? valor : null;
}

/** Convierte los argumentos de una RPC en JSONB tipado para Supabase. */
export function comoJson(valor: Record<string, unknown>): Json {
  return valor as Json;
}

export type SolicitudRpcPropuesta = {
  /** Permiso(s) requerido(s) por la Server Action (`can()` en servidor). */
  permiso: string | string[];
  /** Nombre de la RPC (una de las del bloque B4). */
  rpc: string;
  /** Argumentos de la RPC (sin actor ni correlation: los agrega el helper). */
  args: Record<string, unknown>;
  /** Acción estable para la bitácora. */
  accion: string;
  /** Detalles de auditoría (sin secretos). */
  detalles?: Record<string, unknown>;
};

type ErrorRpc = { message: string; details?: string | null } | null;

/**
 * Ejecuta una RPC de propuestas con el flujo estándar: sesión, permiso,
 * `correlationId`, cliente admin y traducción de errores tipados. El llamador
 * decide el recurso de auditoría y la forma del resultado.
 */
export async function ejecutarRpcPropuesta(
  solicitud: SolicitudRpcPropuesta,
  recursoId: string,
): Promise<RespuestaAccion<Record<string, unknown>>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }
  if (!(await can(usuario, 'propuesta_vista'))) {
    return { exito: false, error: 'Sin permiso para ver propuestas' };
  }
  const permisos = Array.isArray(solicitud.permiso) ? solicitud.permiso : [solicitud.permiso];
  for (const permiso of permisos) {
    if (!(await can(usuario, permiso))) {
      return { exito: false, error: 'Sin permiso para esta acción sobre la propuesta' };
    }
  }

  const correlationId = nuevoCorrelationId();
  const admin = crearClienteSupabaseAdmin();
  const llamarRpc = admin.rpc.bind(admin) as (
    nombre: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: ErrorRpc }>;
  const { data, error } = await llamarRpc(solicitud.rpc, {
    ...solicitud.args,
    p_actor: usuario.id,
    p_correlation_id: correlationId,
  });

  if (error || data === null) {
    console.error('[PROPUESTAS] Acción rechazada:', solicitud.rpc, error?.message);
    await registrarLog(
      usuario,
      `${solicitud.accion}_rechazado`,
      'propuestas',
      recursoId,
      { codigo: (error?.message ?? 'sin_respuesta').slice(0, 120) },
      correlationId,
    );
    return {
      exito: false,
      error: traducirErrorPropuesta(error?.message ?? '', error?.details ?? undefined),
    };
  }

  await registrarLog(
    usuario,
    solicitud.accion,
    'propuestas',
    recursoId,
    { ...solicitud.detalles },
    correlationId,
  );

  return {
    exito: true,
    datos:
      data !== null && typeof data === 'object' && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {},
  };
}
