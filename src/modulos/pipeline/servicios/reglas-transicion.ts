import type { EtapaPipeline } from '@/modulos/pipeline/tipos/indice';

/**
 * Transiciones de etapa permitidas hacia adelante. Cualquier destino fuera de
 * esta tabla es una reversión (retroceso) y requiere admin (ver esReversion).
 */
export const TRANSICIONES_VALIDAS: Record<EtapaPipeline, readonly EtapaPipeline[]> = {
  prospecto: ['contactado', 'perdida'],
  contactado: ['cotizado', 'perdida'],
  cotizado: ['negociacion', 'perdida'],
  negociacion: ['ganada', 'perdida'],
  ganada: [],
  perdida: [],
};

/** Etapas activas en orden de avance (sin las terminales ganada/perdida). */
const ORDEN_ETAPAS: readonly EtapaPipeline[] = [
  'prospecto',
  'contactado',
  'cotizado',
  'negociacion',
];

/**
 * ¿Es `hacia` una transición de avance válida desde `desde`?
 * No incluye reversiones (esas se evalúan con esReversion + permiso admin).
 */
export function esTransicionValida(desde: EtapaPipeline, hacia: EtapaPipeline): boolean {
  if (desde === hacia) return false;
  return TRANSICIONES_VALIDAS[desde].includes(hacia);
}

/**
 * ¿Es una reversión (retroceso o deshacer un cierre) que exige admin?
 *
 * - Ir a una etapa terminal ('ganada'/'perdida') NUNCA es reversión: ganar y
 *   perder van por sus acciones específicas (con su permiso/motivo). Esto evita
 *   que un admin fije 'ganada' por la vía de reversión saltándose la promoción
 *   a cliente y el permiso `aprobar_ordenes`.
 * - Deshacer un cierre terminal (salir de 'ganada'/'perdida' hacia una etapa
 *   activa) SÍ es reversión.
 * - Retroceder dentro del orden de avance activo también.
 */
export function esReversion(desde: EtapaPipeline, hacia: EtapaPipeline): boolean {
  if (hacia === 'ganada' || hacia === 'perdida') return false;
  if (desde === 'ganada' || desde === 'perdida') return true;
  const indiceDesde = ORDEN_ETAPAS.indexOf(desde);
  const indiceHacia = ORDEN_ETAPAS.indexOf(hacia);
  return indiceDesde >= 0 && indiceHacia >= 0 && indiceHacia < indiceDesde;
}
