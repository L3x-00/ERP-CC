import type { ClasificacionSaturacion } from '@/modulos/planeacion/servicios/capacidad-servicio';
import type {
  AreaPlaneacion,
  EstadoPlaneacion,
  TurnoPlaneacion,
} from '@/modulos/planeacion/tipos/indice';

/** Etiquetas compartidas por calendario, tarjetas y panel de Planeación. */

export const ETIQUETA_AREA: Record<AreaPlaneacion, string> = {
  sheet_metal: 'Sheet metal',
  taller: 'Taller',
  acabados: 'Acabados',
  ext: 'Proveedor externo',
};

export const ETIQUETA_TURNO: Record<TurnoPlaneacion, string> = {
  matutino: 'Matutino',
  vespertino: 'Vespertino',
  nocturno: 'Nocturno',
};

export const ETIQUETA_ESTADO: Record<EstadoPlaneacion, string> = {
  programada: 'Programada',
  en_preparacion: 'En preparación',
  en_proceso: 'En proceso',
  bloqueada: 'Bloqueada',
  completada: 'Completada',
  cancelada: 'Cancelada',
};

export const VARIANTE_ESTADO: Record<
  EstadoPlaneacion,
  'neutro' | 'alerta' | 'exito' | 'info' | 'peligro' | 'preparacion' | 'proceso'
> = {
  programada: 'info',
  en_preparacion: 'preparacion',
  en_proceso: 'proceso',
  bloqueada: 'alerta',
  completada: 'exito',
  cancelada: 'neutro',
};

/**
 * C9.1/P-06: semáforo de presentación de la carga. El cliente fijó los cortes
 * 70 % («cerca del límite») y 100 % (sólo exceder la capacidad es sobrecarga).
 * Los umbrales viven centralizados en `capacidad-servicio.ts`
 * (`UMBRAL_OCUPACION_AJUSTADA`, `UMBRAL_OCUPACION_SOBRECARGA`): cambiar la
 * configuración es ajustar esas constantes y este mapeo, sin migración.
 */
export const NIVELES_SEMAFORO = ['disponible', 'cerca-del-limite', 'sobrecargado'] as const;

export type NivelSemaforo = (typeof NIVELES_SEMAFORO)[number];

export const ETIQUETA_SEMAFORO: Record<NivelSemaforo, string> = {
  disponible: 'Disponible',
  'cerca-del-limite': 'Cerca del límite',
  sobrecargado: 'Sobrecargado',
};

export const VARIANTE_SEMAFORO: Record<NivelSemaforo, 'exito' | 'alerta' | 'peligro'> = {
  disponible: 'exito',
  'cerca-del-limite': 'alerta',
  sobrecargado: 'peligro',
};

/** Gravedad para reducir varios turnos del día al peor semáforo. */
const GRAVEDAD_SEMAFORO: Record<NivelSemaforo, number> = {
  disponible: 0,
  'cerca-del-limite': 1,
  sobrecargado: 2,
};

export function nivelSemaforoMasGrave(
  actual: NivelSemaforo,
  candidato: NivelSemaforo,
): NivelSemaforo {
  return GRAVEDAD_SEMAFORO[candidato] > GRAVEDAD_SEMAFORO[actual] ? candidato : actual;
}

/**
 * Reduce las 5 clasificaciones de ocupación (70/90/100) a los 3 niveles que
 * pidió el cliente: el 100 % exacto queda en «Cerca del límite»; sólo exceder
 * la capacidad —o programar sobre capacidad 0— es «Sobrecargado».
 */
export function nivelSemaforo(clasificacion: ClasificacionSaturacion): NivelSemaforo {
  if (clasificacion === 'sobrecargado') return 'sobrecargado';
  if (clasificacion === 'ajustado' || clasificacion === 'saturado') return 'cerca-del-limite';
  return 'disponible';
}
