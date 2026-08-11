import type { Tables } from '@/compartido/tipos/supabase';

/** Contratos de dominio de Órdenes de Producción — Sub-fase 5.1. */

const estadosOrden = [
  'borrador',
  'programada',
  'en_proceso',
  'pausada',
  'completada',
  'cancelada',
] as const;

const prioridadesOrden = ['baja', 'normal', 'alta', 'urgente'] as const;
const accionesTiempoOperador = ['inicio', 'pausa', 'fin'] as const;

export type EstadoOrden = (typeof estadosOrden)[number];
export type PrioridadOrden = (typeof prioridadesOrden)[number];
export type AccionTiempoOperador = (typeof accionesTiempoOperador)[number];

export interface Orden {
  id: string;
  folio: string;
  clienteId: string;
  cotizacionId: string | null;
  estado: EstadoOrden;
  prioridad: PrioridadOrden;
  fechaCompromiso: string;
  fechaInicio: string | null;
  fechaFin: string | null;
  creadoEn: string;
  actualizadoEn: string;
}

export interface Partida {
  id: string;
  ordenId: string;
  codigoPieza: string;
  descripcion: string | null;
  cantidadSolicitada: number;
  cantidadProducida: number;
  cantidadScrap: number;
  unidadMedida: string;
  materialId: string | null;
  tiempoEstimadoMinutos: number;
  tiempoRealMinutos: number;
  maquinaAsignada: string | null;
  creadoEn: string;
  actualizadoEn: string;
}

export interface RegistroTiempo {
  id: string;
  partidaId: string;
  operadorId: string;
  accion: AccionTiempoOperador;
  fechaRegistro: string;
  notas: string | null;
  creadoEn: string;
  actualizadoEn: string;
}

/** Filas crudas snake_case derivadas directamente de Supabase local. */
export type FilaOrden = Tables<'ordenes_produccion'>;
export type FilaPartida = Tables<'partidas_orden_produccion'>;
export type FilaRegistroTiempo = Tables<'registros_tiempo_operador'>;

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

export function filaAOrden(fila: FilaOrden): Orden {
  return {
    id: fila.id,
    folio: fila.folio,
    clienteId: fila.cliente_id,
    cotizacionId: fila.cotizacion_id,
    estado: validarValorEnumerado(fila.estado, estadosOrden, 'estado de orden'),
    prioridad: validarValorEnumerado(fila.prioridad, prioridadesOrden, 'prioridad de orden'),
    fechaCompromiso: fila.fecha_compromiso,
    fechaInicio: fila.fecha_inicio,
    fechaFin: fila.fecha_fin,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}

export function filaAPartida(fila: FilaPartida): Partida {
  return {
    id: fila.id,
    ordenId: fila.orden_id,
    codigoPieza: fila.codigo_pieza,
    descripcion: fila.descripcion,
    cantidadSolicitada: Number(fila.cantidad_solicitada),
    cantidadProducida: Number(fila.cantidad_producida),
    cantidadScrap: Number(fila.cantidad_scrap),
    unidadMedida: fila.unidad_medida,
    materialId: fila.material_id,
    tiempoEstimadoMinutos: Number(fila.tiempo_estimado_minutos),
    tiempoRealMinutos: Number(fila.tiempo_real_minutos),
    maquinaAsignada: fila.maquina_asignada,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}

export function filaARegistroTiempo(fila: FilaRegistroTiempo): RegistroTiempo {
  return {
    id: fila.id,
    partidaId: fila.partida_id,
    operadorId: fila.operador_id,
    accion: validarValorEnumerado(fila.accion, accionesTiempoOperador, 'acción de tiempo'),
    fechaRegistro: fila.fecha_registro,
    notas: fila.notas,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}
