import type { Tables } from '@/compartido/tipos/supabase';

/** Contratos de dominio de Producción — Fase 7.1. */

export const ESTADOS_SESION_TRABAJO = ['activa', 'pausada', 'finalizada'] as const;

export const MOTIVOS_PAUSA_SESION = [
  'falta_informacion',
  'material_pendiente',
  'aprobacion_cliente',
  'problema_tecnico',
  'mantenimiento',
  'otro',
] as const;

/** Estados visibles del Kanban; no se persisten en `ordenes_produccion`. */
export const ESTADOS_KANBAN_PRODUCCION = [
  'bandeja',
  'en_proceso',
  'pausada',
  'lista',
  'entregada',
] as const;

export type EstadoSesionTrabajo = (typeof ESTADOS_SESION_TRABAJO)[number];
export type MotivoPausaSesion = (typeof MOTIVOS_PAUSA_SESION)[number];
export type EstadoKanbanProduccion = (typeof ESTADOS_KANBAN_PRODUCCION)[number];

/**
 * Registro de trabajo de un operador sobre una partida ya programada. `lista` no
 * aparece aquí ni en ningún estado persistente: es una etiqueta derivada del Kanban
 * (ver `src/compartido/constantes/indice.ts`), no un estado de sesión ni de OP.
 */
export interface SesionTrabajo {
  id: string;
  ordenId: string;
  partidaId: string;
  programacionId: string;
  operadorId: string;
  fechaInicio: string;
  fechaFin: string | null;
  horasBrutas: number;
  horasNetas: number;
  piezasProducidas: number;
  motivoPausa: MotivoPausaSesion | null;
  notas: string | null;
  estadoSesion: EstadoSesionTrabajo;
  creadoEn: string;
  actualizadoEn: string;
}

/** Encabezado de entrega. `folio`, `esParcial` y `creadoPor` los resuelve el servidor. */
export interface NotaEntrega {
  id: string;
  ordenId: string;
  folio: string;
  recibidoPor: string;
  firmaClienteUrl: string | null;
  esParcial: boolean;
  creadoPor: string;
  creadoEn: string;
}

/** Renglón de una nota: `cantidadSolicitada` la copia el servidor desde la partida. */
export interface PartidaNotaEntrega {
  id: string;
  notaEntregaId: string;
  partidaId: string;
  cantidadEntregada: number;
  cantidadSolicitada: number;
}

/** Filas crudas snake_case derivadas directamente de los tipos generados de Supabase. */
export type FilaSesionTrabajo = Tables<'sesiones_trabajo'>;
export type FilaNotaEntrega = Tables<'notas_entrega'>;
export type FilaPartidaNotaEntrega = Tables<'partidas_nota_entrega'>;

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

export function filaASesionTrabajo(fila: FilaSesionTrabajo): SesionTrabajo {
  return {
    id: fila.id,
    ordenId: fila.orden_id,
    partidaId: fila.partida_id,
    programacionId: fila.programacion_id,
    operadorId: fila.operador_id,
    fechaInicio: fila.fecha_inicio,
    fechaFin: fila.fecha_fin,
    horasBrutas: Number(fila.horas_brutas),
    horasNetas: Number(fila.horas_netas),
    piezasProducidas: Number(fila.piezas_producidas),
    motivoPausa:
      fila.motivo_pausa === null
        ? null
        : validarValorEnumerado(fila.motivo_pausa, MOTIVOS_PAUSA_SESION, 'motivo de pausa'),
    notas: fila.notas,
    estadoSesion: validarValorEnumerado(
      fila.estado_sesion,
      ESTADOS_SESION_TRABAJO,
      'estado de sesión',
    ),
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}

export function filaANotaEntrega(fila: FilaNotaEntrega): NotaEntrega {
  return {
    id: fila.id,
    ordenId: fila.orden_id,
    folio: fila.folio,
    recibidoPor: fila.recibido_por,
    firmaClienteUrl: fila.firma_cliente_url,
    esParcial: fila.es_parcial,
    creadoPor: fila.creado_por,
    creadoEn: fila.creado_en,
  };
}

export function filaAPartidaNotaEntrega(fila: FilaPartidaNotaEntrega): PartidaNotaEntrega {
  return {
    id: fila.id,
    notaEntregaId: fila.nota_entrega_id,
    partidaId: fila.partida_id,
    cantidadEntregada: Number(fila.cantidad_entregada),
    cantidadSolicitada: Number(fila.cantidad_solicitada),
  };
}
