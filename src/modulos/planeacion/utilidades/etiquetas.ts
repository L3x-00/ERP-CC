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
  'neutro' | 'alerta' | 'exito' | 'info'
> = {
  programada: 'neutro',
  en_preparacion: 'info',
  en_proceso: 'info',
  bloqueada: 'alerta',
  completada: 'exito',
  cancelada: 'neutro',
};
