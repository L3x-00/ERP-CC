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

/**
 * Archivo congelado en la orden, ya derivado para mostrarse: Origen («RFQ», «Propuesta Rev A»),
 * Asociado a (ITxx o «(general)») y Tipo (por clase; «-» si no se conoce). `archivoId` solo sirve
 * para abrirlo: la pantalla nunca lo imprime.
 */
export interface ArchivoFicha {
  archivoId: string;
  nombreOriginal: string | null;
  nombreErp: string | null;
  origen: string;
  asociadoA: string;
  tipo: string;
  /** false cuando el archivo del snapshot ya no tiene fila (no se puede abrir). */
  disponible: boolean;
}

/** Ítem de la hoja de trabajo: solo lo que el piso necesita para fabricar; nunca economía. */
export interface ItemHojaTrabajo {
  codigoItem: string;
  descripcion: string | null;
  cantidad: number | null;
  material: string | null;
  espesor: string | null;
  procesos: string[];
  observaciones: string | null;
}

/** Hoja de trabajo (R17): el documento de la orden sin precios, costos, totales ni moneda. */
export interface HojaTrabajoOrden {
  folio: string;
  clienteNombre: string | null;
  observacionesOrden: string | null;
  items: ItemHojaTrabajo[];
  archivos: ArchivoFicha[];
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

/** Paso de la ruta de un ítem: proceso y horas estimadas; nunca tarifa, costo ni precio. */
export interface PasoRutaFicha {
  secuencia: number;
  proceso: string;
  prepHoras: number | null;
  operacionHoras: number | null;
}

export interface RutaItemFicha {
  codigoItem: string;
  descripcion: string | null;
  pasos: PasoRutaFicha[];
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
    /** Folio humano de la OP que originó esta; no expone su identificador interno. */
    ordenOrigenFolio?: string | null;
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
  /** Ruta por ítem proyectada por lista blanca; visible para todo rol con orden_vista. */
  ruta: RutaItemFicha[];
  snapshot: SnapshotOrdenSii | null;
  totales: TotalesSnapshot | null;
  entregas: EntregaFicha[];
  eventos: EventoFicha[];
  /** Archivos congelados con su tabla Origen/Asociado/Tipo; visibles para todo rol con orden_vista. */
  archivos: ArchivoFicha[];
  /** Hoja de trabajo sin economía; null en órdenes sin snapshot válido. Visible con orden_vista. */
  hojaTrabajo: HojaTrabajoOrden | null;
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
