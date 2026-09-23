import type { Log } from '../tipos/indice';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACCIONES_ORDEN = new Set([
  'crear_orden_manual', 'cambiar_estado_orden', 'cambio_estado_orden_rechazado',
  'actualizar_orden_borrador', 'edicion_orden_rechazada',
]);

/** Enlaza únicamente registros cuya identidad coincide con el recurso auditado. */
export function enlaceRegistroAuditado(log: Pick<Log, 'modulo' | 'accion' | 'recursoId'>): string | null {
  if (!UUID.test(log.recursoId)) return null;
  const id = encodeURIComponent(log.recursoId);
  if (log.modulo === 'pipeline') return `/pipeline?oportunidad=${id}`;
  if (log.modulo === 'clientes') return `/clientes?cliente=${id}`;
  if (log.modulo === 'ordenes' && ACCIONES_ORDEN.has(log.accion)) return `/ordenes?ordenId=${id}`;
  return null;
}
