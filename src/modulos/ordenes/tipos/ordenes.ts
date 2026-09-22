import type { Tables } from '@/compartido/tipos/supabase';

/** Contratos de dominio de Órdenes de Producción — Sub-fase 5.1. */

export const ESTADOS_ORDEN_PRODUCCION = [
  'borrador',
  'programada',
  'en_proceso',
  'pausada',
  'completada',
  'cancelada',
] as const;

export const PRIORIDADES_ORDEN_PRODUCCION = ['baja', 'normal', 'alta', 'urgente'] as const;
export const ACCIONES_TIEMPO_OPERADOR = ['inicio', 'pausa', 'fin'] as const;

export type EstadoOrden = (typeof ESTADOS_ORDEN_PRODUCCION)[number];
export type PrioridadOrden = (typeof PRIORIDADES_ORDEN_PRODUCCION)[number];
export type AccionTiempoOperador = (typeof ACCIONES_TIEMPO_OPERADOR)[number];

export interface Orden {
  id: string;
  folio: string;
  clienteId: string;
  cotizacionId: string | null;
  /**
   * RFQ-10: folio comercial (CNC-…) de la cotización de origen, cuando el
   * listado la embebe; `undefined` en rutas que no la cargan.
   */
  folioCotizacionCnc?: string | null;
  estado: EstadoOrden;
  prioridad: PrioridadOrden;
  fechaCompromiso: string;
  fechaInicio: string | null;
  fechaFin: string | null;
  motivoCancelacion: string | null;
  /** DAS-01/RFQ-09: la orden es un trabajo interno (TI). */
  esInterna: boolean;
  /** OBS-21: fecha de archivo automático al completar la entrega; null activa. */
  archivadaEn: string | null;
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
  operadorAsignadoId: string | null;
  /** OBS-14/OBS-09: código del área/subárea/proceso del catálogo de taller. */
  areaTrabajoCodigo?: string | null;
  /** OBS-14/OBS-09: procesos solicitados de la línea de cotización. */
  procesos?: string[];
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

/** Consumo real de material asociado a una partida, en unidad de control. */
export interface RegistroConsumoMaterial {
  id: string;
  partidaId: string;
  materialId: string;
  cantidadUsada: number;
  cantidadScrap: number;
  costoUnitarioMomento: number;
  creadoEn: string;
}

/** Evento inmutable de producción buena y scrap por operador. */
export interface RegistroAvancePartida {
  id: string;
  partidaId: string;
  operadorId: string;
  cantidadProducida: number;
  cantidadScrap: number;
  creadoEn: string;
}

/** Filas crudas snake_case derivadas directamente de Supabase local. */
export type FilaOrden = Tables<'ordenes_produccion'>;
export type FilaPartida = Tables<'partidas_orden_produccion'>;
export type FilaRegistroTiempo = Tables<'registros_tiempo_operador'>;
export type FilaRegistroConsumoMaterial = Tables<'registros_consumo_material'>;
export type FilaRegistroAvancePartida = Tables<'registros_avance_partida'>;

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
    estado: validarValorEnumerado(fila.estado, ESTADOS_ORDEN_PRODUCCION, 'estado de orden'),
    prioridad: validarValorEnumerado(
      fila.prioridad,
      PRIORIDADES_ORDEN_PRODUCCION,
      'prioridad de orden',
    ),
    fechaCompromiso: fila.fecha_compromiso,
    fechaInicio: fila.fecha_inicio,
    fechaFin: fila.fecha_fin,
    motivoCancelacion: fila.motivo_cancelacion,
    esInterna: fila.es_interna,
    archivadaEn: fila.archivada_en,
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
    operadorAsignadoId: fila.operador_asignado_id,
    areaTrabajoCodigo: fila.area_trabajo_codigo,
    procesos: fila.procesos ?? [],
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}

export function filaARegistroTiempo(fila: FilaRegistroTiempo): RegistroTiempo {
  return {
    id: fila.id,
    partidaId: fila.partida_id,
    operadorId: fila.operador_id,
    accion: validarValorEnumerado(fila.accion, ACCIONES_TIEMPO_OPERADOR, 'acción de tiempo'),
    fechaRegistro: fila.fecha_registro,
    notas: fila.notas,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}

export function filaARegistroConsumoMaterial(
  fila: FilaRegistroConsumoMaterial,
): RegistroConsumoMaterial {
  return {
    id: fila.id,
    partidaId: fila.partida_id,
    materialId: fila.material_id,
    cantidadUsada: Number(fila.cantidad_usada),
    cantidadScrap: Number(fila.cantidad_scrap),
    costoUnitarioMomento: Number(fila.costo_unitario_momento),
    creadoEn: fila.creado_en,
  };
}

export function filaARegistroAvancePartida(
  fila: FilaRegistroAvancePartida,
): RegistroAvancePartida {
  return {
    id: fila.id,
    partidaId: fila.partida_id,
    operadorId: fila.operador_id,
    cantidadProducida: Number(fila.cantidad_producida),
    cantidadScrap: Number(fila.cantidad_scrap),
    creadoEn: fila.creado_en,
  };
}
