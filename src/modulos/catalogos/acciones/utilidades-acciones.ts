import type { RespuestaAccion } from '@/compartido/tipos/indice';
import type { UsuarioAutenticado } from '@/modulos/autenticacion/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';

/** Módulo de auditoría de todos los catálogos base. */
export const MODULO_CATALOGOS = 'catalogos';

/** Código estable de PostgreSQL incluido en el error de PostgREST. */
function codigoPostgres(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const codigo = (error as { code?: unknown }).code;
  return typeof codigo === 'string' ? codigo : null;
}

function detalleError(error: unknown): string {
  if (typeof error !== 'object' || error === null) return '';
  const mensaje = (error as { message?: unknown }).message;
  return typeof mensaje === 'string' ? mensaje : '';
}

/** Traduce errores técnicos a mensajes de negocio sin filtrar detalle crudo. */
export function mensajeErrorCatalogo(error: unknown): string {
  const codigo = codigoPostgres(error);
  const detalle = detalleError(error);
  if (codigo === '23505' || detalle.includes('duplicate key')) {
    return 'Ya existe un registro con ese código o combinación';
  }
  if (codigo === '23503') return 'La referencia seleccionada no existe';
  if (detalle.includes('codigo_canal_inmutable')) {
    return 'El código del canal es estable; crea otro canal si necesitas un código distinto';
  }
  if (codigo === '23514') return 'Los datos no cumplen una regla del catálogo';
  if (detalle.includes('catalogo_sin_borrado')) return 'Los catálogos no se borran: usa activo/inactivo';
  if (detalle.includes('catalogo_no_encontrado')) return 'El registro ya no existe';
  return 'No se pudo guardar el catálogo';
}

/**
 * Ejecuta la mutación, registra la auditoría con el usuario real y separa el
 * detalle técnico del mensaje público.
 */
export async function ejecutarAccionCatalogo<T>(
  usuario: UsuarioAutenticado,
  accion: string,
  recursoId: string,
  ejecutar: () => Promise<T>,
  detalles: Record<string, unknown> = {},
): Promise<RespuestaAccion<T>> {
  const correlationId = nuevoCorrelationId();
  try {
    const datos = await ejecutar();
    await registrarLog(usuario, accion, MODULO_CATALOGOS, recursoId, detalles, correlationId);
    return { exito: true, datos };
  } catch (error) {
    console.error(`[CATALOGOS] ${accion}:`, error);
    await registrarLog(usuario, `${accion}_rechazada`, MODULO_CATALOGOS, recursoId, {
      codigo: codigoPostgres(error) ?? 'error_servicio_catalogos',
    }, correlationId);
    return { exito: false, error: mensajeErrorCatalogo(error) };
  }
}
