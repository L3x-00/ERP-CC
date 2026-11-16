/**
 * Mapa único de estados del negocio → color semántico + etiqueta legible.
 *
 * Vive fuera del componente para que también lo usen textos planos (fichas,
 * párrafos, correos) y no solo el `BadgeEstado`. Así un enum crudo
 * (`en_proceso`, `PRODUCCION_COMPLETADA`) nunca llega a la pantalla.
 */

export type TonoEstado = 'neutro' | 'exito' | 'advertencia' | 'peligro' | 'info';

export type DefinicionEstado = {
  tono: TonoEstado;
  etiqueta: string;
  /** Punto pulsante para estados con actividad en tiempo real. */
  ping?: boolean;
};

const ESTADOS: Record<string, DefinicionEstado> = {
  // Órdenes de producción
  borrador: { tono: 'neutro', etiqueta: 'Borrador' },
  programada: { tono: 'info', etiqueta: 'Programada' },
  en_proceso: { tono: 'info', etiqueta: 'En proceso', ping: true },
  pausada: { tono: 'advertencia', etiqueta: 'Pausada' },
  completada: { tono: 'exito', etiqueta: 'Completada' },
  terminada: { tono: 'exito', etiqueta: 'Terminada' },
  finalizada: { tono: 'exito', etiqueta: 'Finalizada' },
  lista: { tono: 'exito', etiqueta: 'Lista' },
  entregada: { tono: 'exito', etiqueta: 'Entregada' },
  cancelada: { tono: 'neutro', etiqueta: 'Cancelada' },
  cancelado: { tono: 'neutro', etiqueta: 'Cancelado' },

  // Sesiones de producción
  activa: { tono: 'exito', etiqueta: 'Activa', ping: true },

  // Órdenes SII-B5 (estado derivado del avance)
  confirmada: { tono: 'neutro', etiqueta: 'Confirmada' },
  en_produccion: { tono: 'info', etiqueta: 'En producción', ping: true },
  produccion_completada: { tono: 'exito', etiqueta: 'Producción completada' },
  cerrada: { tono: 'exito', etiqueta: 'Cerrada' },

  // Facturación/Compras/Tesorería (SII-B8)
  emitida: { tono: 'exito', etiqueta: 'Emitida' },
  recibida: { tono: 'info', etiqueta: 'Recibida' },
  conciliado: { tono: 'exito', etiqueta: 'Conciliado' },

  // Cobranza / Gastos
  pendiente: { tono: 'advertencia', etiqueta: 'Pendiente' },
  parcial: { tono: 'info', etiqueta: 'Parcial' },
  parcialmente_pagada: { tono: 'info', etiqueta: 'Parcialmente pagada' },
  pagado: { tono: 'exito', etiqueta: 'Pagado' },
  pagada: { tono: 'exito', etiqueta: 'Pagada' },
  aprobado: { tono: 'info', etiqueta: 'Aprobado' },
  vencida: { tono: 'peligro', etiqueta: 'Vencida', ping: true },

  // Planeación
  en_preparacion: { tono: 'info', etiqueta: 'En preparación' },
  en_uso: { tono: 'info', etiqueta: 'En uso', ping: true },
  bloqueada: { tono: 'advertencia', etiqueta: 'Bloqueada' },

  // Clientes / Pipeline
  prospecto: { tono: 'neutro', etiqueta: 'Prospecto' },
  activo: { tono: 'exito', etiqueta: 'Activo' },
  inactivo: { tono: 'neutro', etiqueta: 'Inactivo' },
  contactado: { tono: 'info', etiqueta: 'Contactado' },
  cotizado: { tono: 'info', etiqueta: 'Cotizado' },
  negociacion: { tono: 'advertencia', etiqueta: 'Negociación' },
  ganada: { tono: 'exito', etiqueta: 'Ganada' },
  perdida: { tono: 'peligro', etiqueta: 'Perdida' },

  // RFQ (SII-B3): estados propios del ciclo de vida
  new: { tono: 'neutro', etiqueta: 'Nuevo' },
  incomplete: { tono: 'advertencia', etiqueta: 'Incompleto' },
  waiting_customer: { tono: 'info', etiqueta: 'En espera del cliente' },
  waiting_technical: { tono: 'info', etiqueta: 'En espera técnica' },
  ready_for_proposal: { tono: 'exito', etiqueta: 'Listo para propuesta' },
  converted: { tono: 'exito', etiqueta: 'Convertido' },
  closed: { tono: 'neutro', etiqueta: 'Cerrado' },
  cancelled: { tono: 'neutro', etiqueta: 'Cancelado' },
  // Indicación de captura (no es un estado del ciclo de vida del RFQ).
  captura_lista: { tono: 'exito', etiqueta: 'Listo para validar' },

  // Corridas (SII-B6)
  planificada: { tono: 'neutro', etiqueta: 'Planificada' },

  // Inventario
  ok: { tono: 'exito', etiqueta: 'Stock OK' },
  reorden: { tono: 'advertencia', etiqueta: 'Punto de reorden' },
  critico: { tono: 'peligro', etiqueta: 'Stock crítico' },
  agotado: { tono: 'peligro', etiqueta: 'Agotado' },
};

/** Normaliza el estado recibido (espacios/guiones/mayúsculas) a la clave del mapa. */
export function normalizarEstado(estado: string): string {
  return estado.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/** Definición (tono y etiqueta) de un estado; `undefined` si no está catalogado. */
export function definicionEstado(estado: string): DefinicionEstado | undefined {
  return ESTADOS[normalizarEstado(estado)];
}

/**
 * Texto legible de un estado para fichas, párrafos y avisos.
 * Un estado desconocido se devuelve tal cual para no inventar información.
 */
export function etiquetaEstado(estado: string | null | undefined): string {
  if (!estado) return '—';
  return definicionEstado(estado)?.etiqueta ?? estado;
}
