import type {
  ColumnaEspacioOperador,
  EstadoCorrida,
  EstadoKanbanProduccion,
} from '@/modulos/produccion/tipos/indice';

/**
 * Un lote recién creado queda en PLANIFICADA: todavía no se inició con el
 * checklist, así que pertenece a Bandeja. Mostrarlo en «En proceso» daba un
 * falso positivo al operador. Las corridas terminadas o canceladas ya no son
 * trabajo activo del tablero.
 */
const COLUMNA_OPERADOR: Partial<Record<EstadoCorrida, ColumnaEspacioOperador>> = {
  PLANIFICADA: 'bandeja',
  EN_PROCESO: 'en_proceso',
  PAUSADA: 'pausada',
};

const COLUMNA_ADMIN: Partial<Record<EstadoCorrida, EstadoKanbanProduccion>> = {
  PLANIFICADA: 'bandeja',
  EN_PROCESO: 'en_proceso',
  PAUSADA: 'pausada',
};

/** Columna del tablero del operador para una corrida; null si ya no está activa. */
export function columnaOperadorLote(estado: EstadoCorrida): ColumnaEspacioOperador | null {
  return COLUMNA_OPERADOR[estado] ?? null;
}

/** Columna del tablero de producción para una corrida; null si ya no está activa. */
export function columnaAdminLote(estado: EstadoCorrida): EstadoKanbanProduccion | null {
  return COLUMNA_ADMIN[estado] ?? null;
}
