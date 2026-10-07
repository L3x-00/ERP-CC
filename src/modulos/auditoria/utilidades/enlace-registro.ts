import type { Log, RegistroActividad } from '../tipos/indice';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACCIONES_ORDEN = new Set([
  'crear_orden_manual', 'cambiar_estado_orden', 'cambio_estado_orden_rechazado',
  'actualizar_orden_borrador', 'edicion_orden_rechazada',
]);

/** Enlaza únicamente registros cuya identidad coincide con el recurso auditado. */
export function enlaceRegistroAuditado(log: Pick<Log, 'modulo' | 'accion' | 'recursoId'>): string | null {
  if (!UUID.test(log.recursoId)) return null;
  const id = encodeURIComponent(log.recursoId);
  if (log.modulo === 'pipeline') return `/rfq?rfq=${id}`;
  if (log.modulo === 'clientes') return `/clientes?cliente=${id}`;
  if (log.modulo === 'ordenes' && ACCIONES_ORDEN.has(log.accion)) return `/ordenes?ordenId=${id}`;
  return null;
}

/**
 * Enlace a la ficha del registro para la vista Actividad, usando la entidad
 * resuelta en SQL por la RPC. Devuelve null cuando no hay destino conocido o el
 * recurso no es un UUID (nunca se inventa una ruta).
 */
export function enlaceRegistroActividad(
  registro: Pick<RegistroActividad, 'entidad' | 'recursoId'>,
): string | null {
  if (!UUID.test(registro.recursoId)) return null;
  const id = encodeURIComponent(registro.recursoId);
  if (registro.entidad === 'pipeline') return `/rfq?rfq=${id}`;
  if (registro.entidad === 'cliente') return `/clientes?cliente=${id}`;
  if (registro.entidad === 'orden') return `/ordenes?ordenId=${id}`;
  // Estas entidades pueden auditar una cabecera o un registro hijo. Sin un
  // destino de ficha inequívoco, se enlaza a la pantalla del módulo.
  if (registro.entidad === 'propuesta') return '/propuestas';
  if (registro.entidad === 'produccion') return '/produccion';
  if (registro.entidad === 'tesoreria') return '/tesoreria';
  return null;
}
