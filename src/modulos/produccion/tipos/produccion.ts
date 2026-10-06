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

/** SII-B6.2: causas configurables del catálogo de pausas (códigos). */
export const MOTIVOS_PAUSA_CATALOGO = [
  'DUDA',
  'MATERIAL',
  'FALLA',
  'COMIDA',
  'FIN_JORNADA',
  'OTRA',
] as const;

/** Checklist de eventos críticos exigido al iniciar sesión (§6.2). */
export const CLAVES_VERIFICACION_INICIO = [
  'material',
  'espesor',
  'cantidad',
  'archivo',
  'proceso_equipo',
  'observaciones',
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
export type MotivoPausaCatalogo = (typeof MOTIVOS_PAUSA_CATALOGO)[number];
export type ClaveVerificacionInicio = (typeof CLAVES_VERIFICACION_INICIO)[number];
export type EstadoKanbanProduccion = (typeof ESTADOS_KANBAN_PRODUCCION)[number];

/** Checklist capturado al iniciar (las claves booleanas deben venir en true). */
export type VerificacionInicio = {
  material: boolean;
  espesor: boolean;
  cantidad: boolean;
  archivo: boolean;
  proceso_equipo: boolean;
  observaciones: string;
};

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
  /** SII-B6.1: corrida de la sesión; null en históricos previos a B6. */
  corridaId: string | null;
  fechaInicio: string;
  fechaFin: string | null;
  horasBrutas: number;
  horasNetas: number;
  piezasProducidas: number;
  motivoPausa: MotivoPausaSesion | null;
  /** SII-B6.2: código del catálogo de motivos y nota asociada. */
  motivoPausaCodigo: string | null;
  motivoPausaNota: string | null;
  /** SII-B6.2: true si un supervisor reclamó el recurso tras ≥60 min. */
  recursoLiberado: boolean;
  /** SII-B6.2: checklist de eventos críticos capturado en el inicio. */
  verificacionInicio: VerificacionInicio | null;
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
export type FilaMetaProcesoPartida = Tables<'metas_proceso_partida'>;

/** ORD-07/PRD-09: meta ordenada de una pareja partida×proceso. */
export interface MetaProcesoPartida {
  id: string;
  partidaId: string;
  secuencia: number;
  nombre: string;
  metaPiezas: number;
}

export function filaAMetaProcesoPartida(fila: FilaMetaProcesoPartida): MetaProcesoPartida {
  return {
    id: fila.id,
    partidaId: fila.partida_id,
    secuencia: Number(fila.secuencia),
    nombre: fila.nombre,
    metaPiezas: Number(fila.meta_piezas),
  };
}

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

/** Normaliza el jsonb de verificación; null si no tiene la forma del checklist. */
export function verificacionInicioDesdeJson(valor: unknown): VerificacionInicio | null {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) return null;
  const objeto = valor as Record<string, unknown>;
  const checklist: VerificacionInicio = {
    material: objeto.material === true,
    espesor: objeto.espesor === true,
    cantidad: objeto.cantidad === true,
    archivo: objeto.archivo === true,
    proceso_equipo: objeto.proceso_equipo === true,
    observaciones: typeof objeto.observaciones === 'string' ? objeto.observaciones : '',
  };
  return checklist;
}

export function filaASesionTrabajo(fila: FilaSesionTrabajo): SesionTrabajo {
  return {
    id: fila.id,
    ordenId: fila.orden_id,
    partidaId: fila.partida_id,
    programacionId: fila.programacion_id,
    operadorId: fila.operador_id,
    corridaId: fila.corrida_id ?? null,
    fechaInicio: fila.fecha_inicio,
    fechaFin: fila.fecha_fin,
    horasBrutas: Number(fila.horas_brutas),
    horasNetas: Number(fila.horas_netas),
    piezasProducidas: Number(fila.piezas_producidas),
    motivoPausa:
      fila.motivo_pausa === null
        ? null
        : validarValorEnumerado(fila.motivo_pausa, MOTIVOS_PAUSA_SESION, 'motivo de pausa'),
    motivoPausaCodigo: fila.motivo_pausa_codigo ?? null,
    motivoPausaNota: fila.motivo_pausa_nota ?? null,
    recursoLiberado: fila.recurso_liberado ?? false,
    verificacionInicio: verificacionInicioDesdeJson(fila.verificacion_inicio),
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
