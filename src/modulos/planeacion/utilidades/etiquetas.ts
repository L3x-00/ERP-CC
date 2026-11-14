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
 * C9.1/P-06 y Obs. cliente 2026-11-14: semáforo de presentación de la carga.
 * Verde por debajo de la mitad de la jornada, ámbar desde el 50 %, rojo desde
 * el 90 % («saturado») y rojo con aviso cuando se excede la capacidad
 * («sobrecargado»). Los umbrales viven centralizados en `capacidad-servicio.ts`
 * (`UMBRAL_OCUPACION_AJUSTADA`, `UMBRAL_OCUPACION_SATURADA`,
 * `UMBRAL_OCUPACION_SOBRECARGA`): cambiar la configuración es ajustar esas
 * constantes y este mapeo, sin migración.
 */
export const NIVELES_SEMAFORO = [
  'disponible',
  'cerca-del-limite',
  'saturado',
  'sobrecargado',
] as const;

export type NivelSemaforo = (typeof NIVELES_SEMAFORO)[number];

export const ETIQUETA_SEMAFORO: Record<NivelSemaforo, string> = {
  disponible: 'Disponible',
  'cerca-del-limite': 'Cerca del límite',
  saturado: 'Saturado',
  sobrecargado: 'Sobrecargado',
};

export const VARIANTE_SEMAFORO: Record<NivelSemaforo, 'exito' | 'alerta' | 'peligro'> = {
  disponible: 'exito',
  'cerca-del-limite': 'alerta',
  saturado: 'peligro',
  sobrecargado: 'peligro',
};

/** Gravedad para reducir varios turnos del día al peor semáforo. */
const GRAVEDAD_SEMAFORO: Record<NivelSemaforo, number> = {
  disponible: 0,
  'cerca-del-limite': 1,
  saturado: 2,
  sobrecargado: 3,
};

export function nivelSemaforoMasGrave(
  actual: NivelSemaforo,
  candidato: NivelSemaforo,
): NivelSemaforo {
  return GRAVEDAD_SEMAFORO[candidato] > GRAVEDAD_SEMAFORO[actual] ? candidato : actual;
}

/**
 * Reduce las 5 clasificaciones de ocupación (50/90/100) a los 4 niveles
 * visuales: 50–<90 % es ámbar («Cerca del límite»), 90–100 % es rojo
 * («Saturado») y sólo exceder la capacidad —o programar sobre capacidad 0— es
 * «Sobrecargado».
 */
export function nivelSemaforo(clasificacion: ClasificacionSaturacion): NivelSemaforo {
  if (clasificacion === 'sobrecargado') return 'sobrecargado';
  if (clasificacion === 'saturado') return 'saturado';
  if (clasificacion === 'ajustado') return 'cerca-del-limite';
  return 'disponible';
}
