import type { Tables } from '@/compartido/tipos/supabase';

/** Contratos de dominio de Planeación — Sub-fase 6.1. */

export const AREAS_PLANEACION = ['sheet_metal', 'taller', 'acabados', 'ext'] as const;

export const TURNOS_PLANEACION = ['matutino', 'vespertino', 'nocturno'] as const;

export const ESTADOS_PLANEACION = [
  'programada',
  'en_preparacion',
  'en_proceso',
  'bloqueada',
  'completada',
  'cancelada',
] as const;

export type AreaPlaneacion = (typeof AREAS_PLANEACION)[number];
export type TurnoPlaneacion = (typeof TURNOS_PLANEACION)[number];
export type EstadoPlaneacion = (typeof ESTADOS_PLANEACION)[number];

/** Recurso de capacidad finita (máquina, celda o proveedor externo) de un área. */
export interface RecursoPlaneacion {
  id: string;
  codigo: string;
  nombre: string;
  area: AreaPlaneacion;
  activo: boolean;
  creadoEn: string;
  actualizadoEn: string;
}

/** Horas disponibles de un recurso en un turno; la llave es recurso + turno. */
export interface CapacidadRecursoTurno {
  recursoId: string;
  turno: TurnoPlaneacion;
  horasCapacidad: number;
  creadoEn: string;
  actualizadoEn: string;
}

/** Asignación de una partida a un recurso en una fecha y turno concretos. */
export interface ProgramacionArea {
  id: string;
  ordenId: string;
  partidaId: string;
  recursoId: string;
  secuencia: number;
  fechaProgramada: string;
  turno: TurnoPlaneacion;
  horasEstimadas: number;
  ordenPrioridad: number;
  estadoPlaneacion: EstadoPlaneacion;
  creadoEn: string;
  actualizadoEn: string;
}

/** Filas crudas snake_case derivadas directamente de los tipos generados de Supabase. */
export type FilaRecursoPlaneacion = Tables<'recursos_planeacion'>;
export type FilaCapacidadRecursoTurno = Tables<'capacidades_recurso_turno'>;
export type FilaProgramacionArea = Tables<'programacion_areas'>;

/**
 * Las columnas de enumeración viajan como `text` en los tipos generados: un valor
 * fuera del contrato debe romper el mapeo en vez de propagarse como estado inválido.
 */
function validarValorEnumerado<T extends string>(
  valor: string,
  valores: readonly T[],
  campo: string,
): T {
  if (!valores.includes(valor as T)) {
    throw new Error(`Valor inválido en ${campo}: ${valor}`);
  }

  return valor as T;
}

export function filaARecursoPlaneacion(fila: FilaRecursoPlaneacion): RecursoPlaneacion {
  return {
    id: fila.id,
    codigo: fila.codigo,
    nombre: fila.nombre,
    area: validarValorEnumerado(fila.area, AREAS_PLANEACION, 'área de recurso'),
    activo: fila.activo,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}

export function filaACapacidadRecursoTurno(
  fila: FilaCapacidadRecursoTurno,
): CapacidadRecursoTurno {
  return {
    recursoId: fila.recurso_id,
    turno: validarValorEnumerado(fila.turno, TURNOS_PLANEACION, 'turno de capacidad'),
    horasCapacidad: Number(fila.horas_capacidad),
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}

export function filaAProgramacionArea(fila: FilaProgramacionArea): ProgramacionArea {
  return {
    id: fila.id,
    ordenId: fila.orden_id,
    partidaId: fila.partida_id,
    recursoId: fila.recurso_id,
    secuencia: Number(fila.secuencia),
    fechaProgramada: fila.fecha_programada,
    turno: validarValorEnumerado(fila.turno, TURNOS_PLANEACION, 'turno de programación'),
    horasEstimadas: Number(fila.horas_estimadas),
    ordenPrioridad: Number(fila.orden_prioridad),
    estadoPlaneacion: validarValorEnumerado(
      fila.estado_planeacion,
      ESTADOS_PLANEACION,
      'estado de planeación',
    ),
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}
