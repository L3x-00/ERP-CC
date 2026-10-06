import type { Tables } from '@/compartido/tipos/supabase';

/** Clases de archivo de una entrega (B7 §7.2, entidad `entrega`). */
export const CLASES_EVIDENCIA_ENTREGA = ['evidencia', 'firma', 'firma_escaneada'] as const;

export type ClaseEvidenciaEntrega = (typeof CLASES_EVIDENCIA_ENTREGA)[number];

/** Entrega (nota) con sus campos SII. */
export type Entrega = {
  id: string;
  /** Folio legacy NE-###### (siempre presente). */
  folio: string;
  /** Folio SII NE-MMYY_XX-YY; nulo en históricos sin folio_sii de orden. */
  folioSii: string | null;
  ordenId: string;
  esParcial: boolean;
  recibidoPor: string;
  recibidoPorId: string | null;
  entregadoPorId: string | null;
  solicitudId: string | null;
  firmaClienteUrl: string | null;
  fechaEntrega: string;
  creadoPor: string;
  creadoEn: string;
};

/** Renglón de entrega (inmutable) con su ITxx. */
export type RenglonEntrega = {
  id: string;
  notaEntregaId: string;
  partidaId: string;
  codigoItem: string | null;
  cantidadSolicitada: number;
  cantidadEntregada: number;
};

/** Pendiente agregado por ítem (ITxx) para la preparación de una entrega. */
export type PendienteEntregaItem = {
  /** ITxx del snapshot o código de pieza histórico. */
  codigoItem: string;
  descripcion: string;
  partidaIds: string[];
  cantidadSolicitada: number;
  cantidadProducida: number;
  cantidadEntregada: number;
  /** Solicitada − entregada (≥ 0). */
  pendiente: number;
  /** Producida − entregada (≥ 0): tope real de la siguiente entrega. */
  disponible: number;
};

/** Resumen de una partida usado para agrupar pendientes por ITxx. */
export type PartidaPendiente = {
  id: string;
  codigoItem: string | null;
  codigoPieza: string;
  descripcion: string | null;
  cantidadSolicitada: number;
  cantidadProducida: number;
  /** Suma de lo ya entregado en renglones (histórico). */
  cantidadEntregada: number;
};

// Filas crudas de Supabase (snake_case) derivadas de los tipos generados.
export type FilaNotaEntrega = Tables<'notas_entrega'>;
export type FilaPartidaNotaEntrega = Tables<'partidas_nota_entrega'>;

/** Convierte una fila de `notas_entrega` (snake_case) a `Entrega`. */
export function filaAEntrega(fila: FilaNotaEntrega): Entrega {
  return {
    id: fila.id,
    folio: fila.folio,
    folioSii: fila.folio_sii ?? null,
    ordenId: fila.orden_id,
    esParcial: fila.es_parcial,
    recibidoPor: fila.recibido_por,
    recibidoPorId: fila.recibido_por_id ?? null,
    entregadoPorId: fila.entregado_por_id ?? null,
    solicitudId: fila.solicitud_id ?? null,
    firmaClienteUrl: fila.firma_cliente_url ?? null,
    fechaEntrega: fila.fecha_entrega,
    creadoPor: fila.creado_por,
    creadoEn: fila.creado_en,
  };
}

/** Convierte una fila de `partidas_nota_entrega` (snake_case) a `RenglonEntrega`. */
export function filaARenglonEntrega(fila: FilaPartidaNotaEntrega): RenglonEntrega {
  return {
    id: fila.id,
    notaEntregaId: fila.nota_entrega_id,
    partidaId: fila.partida_id,
    codigoItem: fila.codigo_item ?? null,
    cantidadSolicitada: Number(fila.cantidad_solicitada),
    cantidadEntregada: Number(fila.cantidad_entregada),
  };
}
