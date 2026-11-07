/** C13.4: corrida integrada — varios ítems en una sesión con tiempos propios. */

export interface ItemCorrida {
  partidaId: string;
  codigoPieza: string;
  metaProcesoId: string | null;
  cantidadSolicitada: number;
  cantidadProducida: number;
  disponible: number | null;
}

export interface ItemIntegrado {
  partidaId: string;
  piezas: number;
  /** AUD-10: minutos individuales opcionales; NULL = tiempo a nivel de sesión. */
  minutos: number | null;
}

export interface TiempoItemIntegrado {
  sesionId: string;
  fechaInicio: string;
  operadorNombre: string;
  partidaId: string;
  codigoPieza: string;
  piezas: number;
  minutos: number | null;
}
