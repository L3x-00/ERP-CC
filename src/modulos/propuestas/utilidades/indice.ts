import type { CategoriaCosto, EstadoPropuesta } from '@/modulos/propuestas/tipos/indice';

/** Etiqueta legible del estado de propuesta/revisión. */
export const ETIQUETA_ESTADO_PROPIESTA: Record<EstadoPropuesta, string> = {
  DRAFT: 'Borrador',
  PENDING_APPROVAL: 'Aprobación interna',
  READY_TO_SEND: 'Lista para enviar',
  SENT: 'Enviada',
  FOLLOW_UP: 'Seguimiento',
  ACCEPTED: 'Aceptada',
  PENDING_FINANCIAL: 'Pendiente financiero',
  SALE_CONFIRMED: 'Venta confirmada',
  REJECTED: 'Rechazada',
  CLOSED: 'Cerrada',
};

/** Etiqueta legible de la categoría de costo interno. */
export const ETIQUETA_CATEGORIA_COSTO: Record<CategoriaCosto, string> = {
  material: 'Material',
  maquina: 'Máquina',
  mano_obra: 'Mano de obra',
  gastos_directos: 'Gastos directos',
  subcontratacion: 'Subcontratación',
};

/** Código del catálogo (B1.7) que exige texto libre. */
export const CODIGO_ACCION_OTRO = 'OTHER';

/** Estados finales: no admiten más acciones de negocio sustantivas. */
const ESTADOS_TERMINALES: readonly EstadoPropuesta[] = ['SALE_CONFIRMED', 'REJECTED', 'CLOSED'];

/** `true` si la revisión todavía se puede editar (solo DRAFT). */
export function esRevisionEditable(estado: EstadoPropuesta): boolean {
  return estado === 'DRAFT';
}

/** `true` si el estado es terminal (venta confirmada, rechazada o cerrada). */
export function esEstadoTerminal(estado: EstadoPropuesta): boolean {
  return ESTADOS_TERMINALES.includes(estado);
}

/**
 * Letra siguiente de una revisión: A→B … Y→Z; `null` al tope Z (el SQL devuelve
 * `limite_revisiones_alcanzado`).
 */
export function siguienteLetra(letra: string | null): string | null {
  if (letra === null || letra === '' || letra >= 'Z') return null;
  return String.fromCharCode(letra.charCodeAt(0) + 1);
}
