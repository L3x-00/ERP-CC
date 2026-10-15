import type { EstadoSiiOrden, SnapshotOrdenSii } from '@/modulos/ordenes/tipos/orden-sii';

export interface PartidaFicha {
  id: string;
  codigoPieza: string;
  codigoItem: string | null;
  descripcion: string | null;
  cantidadSolicitada: number;
  cantidadProducida: number;
  cantidadScrap: number;
  unidadMedida: string;
  procesos: string[];
  tiempoEstimadoMinutos: number;
  tiempoRealMinutos: number;
  areaTrabajoCodigo: string | null;
}

export interface EntregaFicha {
  id: string;
  folio: string;
  /** Folio SII NE-MMYY_XX-YY; nulo en históricos. */
  folioSii: string | null;
  esParcial: boolean;
  recibidoPor: string;
  creadoEn: string;
  partidas: { partidaId: string; cantidadEntregada: number }[];
}

export interface EventoFicha {
  id: string;
  tipo: string;
  motivo: string | null;
  actorNombre: string | null;
  creadoEn: string;
  detalle: Record<string, unknown>;
}

export interface ArchivoFicha {
  archivoId: string;
  nombreOriginal: string | null;
  nombreErp: string | null;
  clase: string | null;
  mime: string | null;
  origen: 'revision' | 'item';
  itemCodigo: string | null;
}

export interface TotalesSnapshot {
  subtotal: number | null;
  descuento: number | null;
  iva: number | null;
  total: number | null;
  moneda: string | null;
}

/**
 * Origen comercial congelado en el snapshot de la orden. Solo folios humanos y los ids
 * que usan los enlaces; el texto visible nunca muestra los ids.
 */
export interface OrigenComercialFicha {
  rfqId: string | null;
  rfqFolio: string | null;
  propuestaId: string | null;
  propuestaFolio: string | null;
  revisionFolio: string | null;
  revisionLetra: string | null;
}

export interface FichaOrden {
  orden: {
    id: string;
    folio: string;
    folioSii: string | null;
    estadoSii: EstadoSiiOrden;
    estadoLegacy: string;
    prioridad: string;
    fechaCompromisoComercial: string | null;
    fechaOperativa: string;
    archivadaEn: string | null;
    esInterna: boolean;
    idHistorico: string | null;
    referenciaExterna: string | null;
    notas: string | null;
    creadoEn: string;
    actualizadoEn: string;
    cerradaAdminEn: string | null;
    cerradaAdminPorNombre: string | null;
    clienteNombre: string | null;
    moneda: string | null;
  };
  /** Visible para todo rol con orden_vista; null en órdenes internas o anteriores al flujo SII. */
  origen: OrigenComercialFicha | null;
  partidas: PartidaFicha[];
  snapshot: SnapshotOrdenSii | null;
  totales: TotalesSnapshot | null;
  entregas: EntregaFicha[];
  eventos: EventoFicha[];
  archivos: ArchivoFicha[];
}

/** Ids de las pestañas de la ficha, en el orden en que se muestran. */
export const PESTANAS_FICHA = [
  'resumen',
  'partidas',
  'ruta',
  'archivos',
  'entregas',
  'actividad',
  'documento',
  'comentarios',
] as const;

export type PestanaFicha = (typeof PESTANAS_FICHA)[number];
